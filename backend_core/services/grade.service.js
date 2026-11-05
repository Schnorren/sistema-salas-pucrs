import gradeRepository from '../repositories/grade.repository.js';
import { groupConsecutiveClasses, extractPeriodCode, isInternalClass } from '../utils/timeHelpers.js';
import supabase from '../config/supabase.js';
import {
    STATUS_SALA, salaVisivel, situacaoDaSala, ordenarNumeros, separarSalasNovas,
    resumirAgendaPorSala, RESUMO_VAZIO, filtrarPublicacao
} from '../utils/salas.js';
import { ErroPublico } from '../utils/http.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { compararGrades } from '../utils/gradeComparacao.js';

// Grade usada pela busca do topo, por prédio. Serverless é efêmero e cada
// instância tem o seu cache: o TTL garante que uma importação feita em outra
// instância apareça na busca em até 5 min (antes ficava velho até a instância
// morrer).
const TTL_CACHE_BUSCA = 5 * 60 * 1000;
const gradeCache = new Map();

// Extrator de PDF (FastAPI na Vercel). Importação leva ~10 s; acima disso é
// queda/travamento — antes o fetch não tinha timeout e a função ficava presa
// até o limite da plataforma.
const TIMEOUT_EXTRATOR_MS = 90 * 1000;
const MSG_EXTRATOR_FORA = 'O extrator de PDF está fora do ar ou demorando para responder. Tente de novo em 1 minuto.';

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Código do Espaço Físico "C.xx.xx.andar.sala" → número curto da sala
const simplificarSala = (codigo) => {
    if (!codigo) return codigo;
    const texto = String(codigo).trim();
    const partes = texto.split('.');

    if (partes.length >= 5 && partes[0] === 'C') {
        const andar = parseInt(partes[3], 10).toString();
        const sala = partes[4];
        if (sala.startsWith(andar) && sala.length >= 3) return sala;
        return `${andar}${sala}`;
    }
    return texto;
};

class GradeService {

    _invalidarCache(predio_id) {
        if (predio_id) gradeCache.delete(String(predio_id));
        gradeCache.delete('GLOBAL');
    }

    async _obterGradeOtimizada(predio_id) {
        const chave = predio_id ? String(predio_id) : 'GLOBAL';
        const atual = gradeCache.get(chave);
        if (atual && atual.exp > Date.now()) return atual.dados;

        const data = await gradeRepository.buscarGradeCompleta(predio_id);
        // Salas ocultas/pendentes ficam fora de tudo que o sistema mostra
        const dados = Array.isArray(data) ? data.filter(g => salaVisivel(g.salas)) : [];
        gradeCache.set(chave, { dados, exp: Date.now() + TTL_CACHE_BUSCA });
        return dados;
    }

    async gerarEPublicarIndexEstatico(predio_id) {
        try {
            const [gradeBruta, salasDb] = await Promise.all([
                gradeRepository.buscarGradeCompleta(predio_id),
                gradeRepository.buscarSalas(predio_id)
            ]);
            // Só salas visíveis (e os agendamentos delas) vão para o CDN
            const { salas, grade } = filtrarPublicacao(salasDb, gradeBruta);
            const superIndex = {
                predio_id,
                atualizado_em: new Date().toISOString(),
                salas,
                grade,
            };

            const jsonString = JSON.stringify(superIndex);
            const fileName = `grade_predio_${predio_id}.json`;
            const { error } = await supabase
                .storage
                .from('grades')
                .upload(fileName, jsonString, {
                    contentType: 'application/json',
                    upsert: true,
                    // O front já busca com ?t= (sem cache); 60 s limita quanto
                    // tempo qualquer outro leitor pode ver a versão anterior
                    // (o padrão do Storage é 1 h).
                    cacheControl: '60',
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('[grade] falha ao publicar o JSON estático:', error?.message || error);
            return false;
        }
    }

    // Busca da barra do topo (GET /api/grade/busca): aulas da semana cujo nome,
    // sala ou código contém o termo, agrupadas em blocos de períodos seguidos.
    async realizarBuscaGlobal(q, predio_id) {
        if (typeof q !== 'string' || q.trim().length < 2) return [];
        const gradeBruta = await this._obterGradeOtimizada(predio_id);

        const normalizarTexto = (texto) => texto ? String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : '';
        const termoPesquisado = normalizarTexto(q.slice(0, 80));

        const filtrados = gradeBruta.filter(d => {
            const nomeNormalizado = normalizarTexto(d.nome_aula || d.disciplinas?.nome);
            const salaNormalizada = normalizarTexto(d.salas?.numero || d.sala);
            const codigoNormalizado = normalizarTexto(d.disciplinas?.codigo);
            return nomeNormalizado.includes(termoPesquisado) || salaNormalizada.includes(termoPesquisado) || codigoNormalizado.includes(termoPesquisado);
        });

        const resultados = [];
        DIAS.forEach(dia => {
            const aulasDoDia = filtrados.filter(f => f.dia_semana === dia);
            groupConsecutiveClasses(aulasDoDia).forEach(aula => resultados.push({ ...aula, dia_semana: dia }));
        });

        return resultados.sort((a, b) => {
            if (a.dia_semana !== b.dia_semana) return DIAS.indexOf(a.dia_semana) - DIAS.indexOf(b.dia_semana);
            return String(a.sala).localeCompare(String(b.sala), undefined, { numeric: true });
        }).slice(0, 15);
    }

    // `rota` troca o endpoint do extrator (ex.: '/analyze-bi'); padrão = extração da grade.
    // Uma nova tentativa em erro de rede ou 5xx (a extração é pura: repetir é seguro);
    // timeout e 4xx não repetem. Falha sai como ErroPublico — o detalhe vai só para o log.
    async _enviarParaExtrator(buffer, filename, rota = null) {
        const base = process.env.VITE_PYTHON_API_URL || process.env.PYTHON_API_URL;
        const url = base && rota ? base.replace('/extract-pdf', rota) : base;
        if (!url) {
            console.error('[grade] PYTHON_API_URL não definida nas variáveis de ambiente do backend.');
            throw new ErroPublico('O extrator de PDF não está configurado no servidor. Avise o administrador.', 503);
        }

        const boundary = `----PucrsSalas${Date.now().toString(16)}`;
        const cabecalho = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
        const corpo = Buffer.concat([Buffer.from(cabecalho, 'utf8'), buffer, Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')]);

        let ultimoErro = null;
        let statusExtrator = null;
        for (let tentativa = 1; tentativa <= 2; tentativa++) {
            let response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(corpo.length) },
                    body: corpo,
                    signal: AbortSignal.timeout(TIMEOUT_EXTRATOR_MS),
                });
            } catch (err) {
                ultimoErro = err;
                if (err?.name === 'TimeoutError') break; // já esperou 90 s: não dobra a espera
                continue;
            }

            if (response.ok) {
                try {
                    return await response.json();
                } catch {
                    console.error('[grade] extrator devolveu algo que não é JSON.');
                    throw new ErroPublico(MSG_EXTRATOR_FORA, 502);
                }
            }

            statusExtrator = response.status;
            const texto = await response.text().catch(() => '');
            ultimoErro = new Error(`HTTP ${response.status}: ${texto.slice(0, 300) || response.statusText}`);
            if (response.status < 500) break; // o problema é o PDF; repetir não muda
        }

        console.error('[grade] extrator falhou:', ultimoErro?.message || ultimoErro);
        if (statusExtrator && statusExtrator < 500) {
            throw new ErroPublico('O extrator não conseguiu ler este PDF. Confira se é a agenda semanal exportada do Espaço Físico.', 422);
        }
        throw new ErroPublico(MSG_EXTRATOR_FORA, 502);
    }

    // Histórico de aulas (BI): devolve o JSON cru do extrator ({ rawRecords, kpis }).
    // Passa pelo backend para exigir login + módulo Relatórios e não expor o
    // endereço do extrator no código do site.
    async analisarBiPdf(buffer) {
        return await this._enviarParaExtrator(buffer, 'historico.pdf', '/analyze-bi');
    }

    async processarUploadPdf(buffer, predio_id, user = null) {
        // Prédio antes do extrator: sem ele nada seria gravado, então não vale
        // esperar a extração
        if (!predio_id) throw new ErroPublico('Selecione um prédio no menu superior antes de importar a grade.');
        const jsonResponse = await this._enviarParaExtrator(buffer, 'agenda.pdf');
        return await this.processarUploadCsv(jsonResponse?.records, predio_id, user);
    }

    async processarUploadCsv(dadosCsv, predio_id, user = null) {
        if (!predio_id) {
            throw new ErroPublico('Selecione um prédio no menu superior antes de importar a grade.');
        }
        if (!Array.isArray(dadosCsv)) {
            console.error('[grade] resposta do extrator sem "records":', typeof dadosCsv);
            throw new ErroPublico(MSG_EXTRATOR_FORA, 502);
        }

        // Linha sem sala, dia ou período não vira aula (dia_semana e periodo são
        // NOT NULL: antes uma linha assim derrubava o INSERT depois do DELETE)
        const dadosFormatados = dadosCsv
            .map(d => ({ ...d, Sala: simplificarSala(d?.Sala || d?.sala), periodoCodigo: extractPeriodCode(d?.Periodo) }))
            .filter(d => d.Sala && d.Dia && d.periodoCodigo);

        // PDF errado (outro documento, página em branco) → nada é tocado.
        // Antes a grade era apagada e o prédio ficava sem aulas.
        if (!dadosFormatados.length) {
            throw new ErroPublico('Nenhuma aula foi reconhecida neste PDF — a grade atual foi mantida. Confira se é a agenda semanal exportada do Espaço Físico.', 422);
        }

        // Sala que o prédio ainda não conhecia entra como Pendente (oculta até
        // alguém decidir). As existentes não são tocadas: a escolha de
        // visibilidade sobrevive ao re-import.
        const salasExistentes = await gradeRepository.buscarSalasComId(predio_id);
        const primeiraImportacao = salasExistentes.length === 0;
        const numerosNovos = separarSalasNovas(dadosFormatados.map(d => d.Sala), salasExistentes);
        await gradeRepository.inserirSalasNovas(numerosNovos.map(numero => ({ numero, predio_id, status: STATUS_SALA.PENDENTE })));
        const salasDb = numerosNovos.length ? await gradeRepository.buscarSalasComId(predio_id) : salasExistentes;

        const salaMap = {};
        salasDb.forEach(s => { salaMap[s.numero] = s.id; });

        const gradeInsert = dadosFormatados.map(d => ({
            sala_id: salaMap[d.Sala] || null,
            dia_semana: d.Dia,
            periodo: d.periodoCodigo,
            nome_aula: d.Nome_da_Aula,
            tipo: isInternalClass(d.Nome_da_Aula) ? 'Interno' : 'Regular',
            predio_id: predio_id
        })).filter(d => d.sala_id !== null);

        if (!gradeInsert.length) {
            throw new ErroPublico('Nenhuma aula do PDF pôde ser ligada a uma sala do prédio — a grade atual foi mantida.', 422);
        }

        // O que muda em relação à grade atual (lida antes da troca): mostrado na
        // tela de sucesso — PDF da semana errada salta aos olhos.
        const numeroPorId = Object.fromEntries(salasDb.map(s => [s.id, s.numero]));
        const gradeAnterior = primeiraImportacao ? [] : await gradeRepository.buscarGradeCompleta(predio_id);
        const comparacao = compararGrades(
            gradeAnterior.map(g => ({ sala: g.salas?.numero, dia: g.dia_semana, periodo: g.periodo, nome: g.nome_aula })),
            gradeInsert.map(g => ({ sala: numeroPorId[g.sala_id], dia: g.dia_semana, periodo: g.periodo, nome: g.nome_aula })),
        );

        // DELETE + INSERT numa transação (grade_substituir): ou entra a grade
        // nova inteira, ou fica a antiga
        await gradeRepository.substituirGrade(predio_id, gradeInsert);
        this._invalidarCache(predio_id);

        await registrarAuditoria({
            user, acao: 'grade.importar', entidade: 'grade', predioId: predio_id,
            detalhes: {
                aulas: gradeInsert.length, salasNovas: numerosNovos.sort(ordenarNumeros),
                novos: comparacao.novos, removidos: comparacao.removidos, alterados: comparacao.alterados,
            },
        });

        const publicado = await this.gerarEPublicarIndexEstatico(predio_id);
        if (!publicado) {
            // Antes a resposta dizia "sucesso" e as telas seguiam com a grade antiga
            throw new ErroPublico('A grade nova foi gravada, mas não foi publicada para as telas. Importe o PDF de novo em instantes.', 502);
        }

        // Salas à espera de decisão (as novas desta importação + pendentes de
        // importações anteriores), com o resumo da semana para a pergunta na tela
        const resumo = resumirAgendaPorSala(gradeInsert.map(g => ({ sala: numeroPorId[g.sala_id], nome: g.nome_aula, tipo: g.tipo })));
        const novas = new Set(numerosNovos);
        const salasParaDecidir = salasDb
            .filter(s => s.status === STATUS_SALA.PENDENTE)
            .map(s => ({ numero: s.numero, situacao: 'pendente', nova: novas.has(s.numero), ...(resumo.get(s.numero) || RESUMO_VAZIO) }))
            .sort((a, b) => ordenarNumeros(a.numero, b.numero));

        return { sucesso: true, registrosInseridos: gradeInsert.length, primeiraImportacao, salasParaDecidir, comparacao };
    }

    // GET /api/grade/salas — todas as salas do prédio (inclusive ocultas e
    // pendentes) com o resumo da agenda atual de cada uma
    async listarSalas(predio_id) {
        const [salasDb, gradeBruta] = await Promise.all([
            gradeRepository.buscarSalas(predio_id),
            gradeRepository.buscarGradeCompleta(predio_id),
        ]);
        const resumo = resumirAgendaPorSala((gradeBruta || []).map(g => ({ sala: g.salas?.numero, nome: g.nome_aula, tipo: g.tipo })));
        return (salasDb || [])
            .map(s => ({ numero: s.numero, andar: s.andar, situacao: situacaoDaSala(s), ...(resumo.get(s.numero) || RESUMO_VAZIO) }))
            .sort((a, b) => ordenarNumeros(a.numero, b.numero));
    }

    // PUT /api/grade/salas — { exibir: ['205'], ocultar: ['312'] }
    async definirVisibilidadeSalas(predio_id, corpo, user) {
        const lista = (v) => (Array.isArray(v) ? [...new Set(v.map(x => String(x).trim()).filter(Boolean))] : []);
        const exibir = lista(corpo?.exibir);
        const ocultar = lista(corpo?.ocultar);

        if (!exibir.length && !ocultar.length) throw new ErroPublico('Nenhuma sala informada.');
        if (exibir.some(n => ocultar.includes(n))) throw new ErroPublico('Uma sala não pode ser exibida e ocultada ao mesmo tempo.');

        // Só salas deste prédio (req.user.predio_id): número de outro prédio é ignorado
        const doPredio = new Set(((await gradeRepository.buscarSalas(predio_id)) || []).map(s => s.numero));
        const desconhecidas = [...exibir, ...ocultar].filter(n => !doPredio.has(n));
        if (desconhecidas.length) throw new ErroPublico(`Sala não encontrada neste prédio: ${desconhecidas.join(', ')}.`);

        await gradeRepository.atualizarStatusSalas(predio_id, exibir, STATUS_SALA.ATIVA);
        await gradeRepository.atualizarStatusSalas(predio_id, ocultar, STATUS_SALA.OCULTA);

        this._invalidarCache(predio_id);

        await registrarAuditoria({
            user, acao: 'grade.salas.visibilidade', entidade: 'sala', predioId: predio_id,
            detalhes: { exibidas: exibir.sort(ordenarNumeros), ocultadas: ocultar.sort(ordenarNumeros) },
        });

        const publicado = await this.gerarEPublicarIndexEstatico(predio_id);
        if (!publicado) {
            throw new ErroPublico('A escolha foi salva, mas a grade não foi republicada. Clique em salvar de novo em instantes.', 502);
        }
        return { sucesso: true };
    }
}

export default new GradeService();
