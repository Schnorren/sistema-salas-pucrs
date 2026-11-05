import gradeRepository from '../repositories/grade.repository.js';
import {
    PERIODS, getCurrentPeriod, groupConsecutiveClasses, extractPeriodCode, isInternalClass
} from '../utils/timeHelpers.js';
import supabase from '../config/supabase.js';
import {
    STATUS_SALA, salaVisivel, situacaoDaSala, ordenarNumeros, separarSalasNovas,
    resumirAgendaPorSala, RESUMO_VAZIO, filtrarPublicacao
} from '../utils/salas.js';
import { ErroPublico } from '../utils/http.js';
import { registrarAuditoria } from '../utils/auditoria.js';

const gradeCacheMap = {};

class GradeService {

    async _obterGradeOtimizada(predio_id) {
        const cacheKey = predio_id ? String(predio_id) : 'GLOBAL';

        if (gradeCacheMap[cacheKey] && gradeCacheMap[cacheKey].length > 0) {
            return gradeCacheMap[cacheKey];
        }

        const data = await gradeRepository.buscarGradeCompleta(predio_id);

        // Salas ocultas/pendentes ficam fora de tudo que o sistema mostra
        gradeCacheMap[cacheKey] = Array.isArray(data) ? data.filter(g => salaVisivel(g.salas)) : [];

        return gradeCacheMap[cacheKey];
    }

    async obterProximasAulas(diaSolicitado, periodoReferencia, predio_id) {
        const gradeBruta = await this._obterGradeOtimizada(predio_id);
        const activePer = periodoReferencia === 'auto' ? getCurrentPeriod() : periodoReferencia;
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);

        const response = {
            dia: diaSolicitado, periodoAtualReferencia: activePer, labelPeriodoAtual: '',
            emAndamento: [], proximas: [], restoDoDia: [], todasAsAulas: []
        };

        if (activePer) {
            const pi = PERIODS.findIndex(p => p.code === activePer);
            if (pi >= 0) {
                response.labelPeriodoAtual = PERIODS[pi].lb;
                const todasAgrupadas = groupConsecutiveClasses(aulasDoDia);
                response.emAndamento = todasAgrupadas.filter(g => g.periodos.includes(activePer));
                const nextPeriodCodes = PERIODS.slice(pi + 1, pi + 3).map(p => p.code);
                response.proximas = todasAgrupadas.filter(g => nextPeriodCodes.includes(g.periodos[0]));
                const futurePeriodCodes = PERIODS.slice(pi + 3).map(p => p.code);
                response.restoDoDia = todasAgrupadas.filter(g => futurePeriodCodes.includes(g.periodos[0]));
            }
        } else {
            response.todasAsAulas = groupConsecutiveClasses(aulasDoDia);
        }
        return response;
    }

    async _salasVisiveis(predio_id) {
        return ((await gradeRepository.buscarSalas(predio_id)) || []).filter(salaVisivel);
    }

    async obterStatusPlanta(diaSolicitado, periodoReferencia, predio_id) {
        const salasDb = await this._salasVisiveis(predio_id);
            const gradeBruta = await this._obterGradeOtimizada(predio_id) || [];
            const activePer = periodoReferencia === 'auto' ? getCurrentPeriod() : periodoReferencia;

            const aulasNoMomento = gradeBruta.filter(d => {
                const mesmoDia = d.dia_semana?.toLowerCase().includes(diaSolicitado.toLowerCase());

                const codigoPeriodoBanco = extractPeriodCode(d.periodo);

                const noMesmoPeriodo = codigoPeriodoBanco === activePer;

                return mesmoDia && noMesmoPeriodo;
            });

            const salasProcessadas = salasDb.map(s => {
                if (!s || !s.numero) return null;

                const aula = aulasNoMomento.find(a => {
                    const numSala = a.salas?.numero || a.sala;
                    return numSala === s.numero;
                });

                let andarDaSala = s.andar;
                if (!andarDaSala) {
                    const numString = String(s.numero);
                    const partes = numString.split('.');

                    if (partes.length >= 4 && partes[0] === 'C') {
                        andarDaSala = parseInt(partes[3], 10).toString();
                    } else {
                        const match = numString.match(/\d/);
                        andarDaSala = match ? match[0] : '0';
                    }
                }

                return {
                    numero: s.numero,
                    andar: andarDaSala,
                    ocupada: !!aula,
                    disciplina: aula ? (aula.nome_aula || aula.disciplinas?.nome) : null,
                    tipo: aula ? (aula.tipo || (isInternalClass(aula.nome_aula) ? 'Interno' : 'Regular')) : 'Livre'
                };
            }).filter(Boolean);

            const andaresUnicos = [...new Set(salasProcessadas.map(s => String(s.andar)))].sort();

            const andares = andaresUnicos.map(num => ({
                label: num === '0' ? 'Térreo / Outros' : `${num}º Andar`,
                salas: salasProcessadas.filter(s => String(s.andar) === num)
            }));

            return {
                periodoAtual: activePer,
                contagem: {
                    total: salasProcessadas.length,
                    livres: salasProcessadas.filter(s => !s.ocupada).length,
                    ocupadas: salasProcessadas.filter(s => s.ocupada).length
                },
                andares: andares.filter(a => a.salas.length > 0)
            };
    }

    async obterSalasLivres(diaSolicitado, predio_id) {
        const gradeBruta = await this._obterGradeOtimizada(predio_id);
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);
        const salasDb = await this._salasVisiveis(predio_id);

        const salasLivres = salasDb.map(salaRef => {
            const occupiedPeriods = aulasDoDia
                .filter(d => {
                    const numSala = d.salas?.numero || d.sala;
                    return numSala === salaRef.numero;
                })
                .map(d => extractPeriodCode(d.periodo));

            const freePeriods = PERIODS.filter(p => !occupiedPeriods.includes(p.code));

            return {
                sala: salaRef.numero,
                quantidadeLivres: freePeriods.length,
                periodos: freePeriods.map(f => ({
                    code: f.code,
                    label: f.lb,
                    fim: `${String(f.end[0]).padStart(2, '0')}:${String(f.end[1]).padStart(2, '0')}`
                }))
            };
        });

        return salasLivres.filter(s => s.quantidadeLivres > 0);
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
                    upsert: true
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('[grade] falha ao publicar o JSON estático:', error?.message || error);
            return false;
        }
    }

    async obterTimeline(diaSolicitado, predio_id) {
        const salasDb = await this._salasVisiveis(predio_id);
        const gradeBruta = await this._obterGradeOtimizada(predio_id) || [];
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);
        const periodoAtual = getCurrentPeriod();

        const timeline = salasDb.map(salaRef => {
            const slots = PERIODS.map(p => {
                const aulaNoSlot = aulasDoDia.find(d => {
                    const numSala = d.salas?.numero || d.sala;
                    return numSala === salaRef.numero && extractPeriodCode(d.periodo) === p.code;
                });

                return {
                    periodo: p.code,
                    horario: p.lb,
                    isAgora: p.code === periodoAtual,
                    ocupado: !!aulaNoSlot,
                    nome: aulaNoSlot ? (aulaNoSlot.nome_aula || aulaNoSlot.disciplinas?.nome) : null,
                    tipo: aulaNoSlot ? (aulaNoSlot.tipo || (isInternalClass(aulaNoSlot.nome_aula) ? 'Interno' : 'Regular')) : 'Livre'
                };
            });
            return {
                sala: salaRef.numero,
                temAulaAgora: slots.some(s => s.isAgora && s.ocupado),
                slots
            };
        });

        return {
            dia: diaSolicitado,
            periodosCabecalho: PERIODS.map(p => ({ code: p.code, label: p.lb, isAgora: p.code === periodoAtual })),
            timeline
        };
    }

    // Busca da barra do topo (GET /api/grade/busca): aulas da semana cujo nome,
    // sala ou código contém o termo, agrupadas em blocos de períodos seguidos.
    // Restaurada do backend antigo — o handler chamava este método, mas ele se
    // perdeu na migração para serverless e a rota respondia 500.
    async realizarBuscaGlobal(q, predio_id) {
        if (!q || q.length < 2) return [];
        const gradeBruta = await this._obterGradeOtimizada(predio_id);

        const normalizarTexto = (texto) => texto ? String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
        const termoPesquisado = normalizarTexto(q);

        const filtrados = gradeBruta.filter(d => {
            const nomeNormalizado = normalizarTexto(d.nome_aula || d.disciplinas?.nome);
            const salaNormalizada = normalizarTexto(d.salas?.numero || d.sala);
            const codigoNormalizado = normalizarTexto(d.disciplinas?.codigo);
            return nomeNormalizado.includes(termoPesquisado) || salaNormalizada.includes(termoPesquisado) || codigoNormalizado.includes(termoPesquisado);
        });

        const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        const resultados = [];
        dias.forEach(dia => {
            const aulasDoDia = filtrados.filter(f => f.dia_semana === dia);
            groupConsecutiveClasses(aulasDoDia).forEach(aula => resultados.push({ ...aula, dia_semana: dia }));
        });

        return resultados.sort((a, b) => {
            if (a.dia_semana !== b.dia_semana) return dias.indexOf(a.dia_semana) - dias.indexOf(b.dia_semana);
            return String(a.sala).localeCompare(String(b.sala), undefined, { numeric: true });
        }).slice(0, 15);
    }

    _processarOcupacaoSemanl(gradeBruta, salasLista) {
        const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        const ocupacaoBase = gradeBruta.map(g => ({
            sala: g.salas?.numero || g.Sala || g.sala,
            dia: g.dia_semana || g.Dia || g.dia,
            periodo: extractPeriodCode(g.periodo || g.Periodo)
        })).filter(item => item.sala && item.dia);

        return {
            diasDisponiveis: diasSemana,
            salasDisponiveis: salasLista,
            periodosDisponiveis: PERIODS.map(p => p.code),
            ocupacaoBase
        };
    }

    async obterOcupacaoSemanal(predio_id) {
        const salasDb = await this._salasVisiveis(predio_id);
        const gradeBruta = await this._obterGradeOtimizada(predio_id);
        const listaNumeros = salasDb.map(s => s.numero);
        return this._processarOcupacaoSemanl(gradeBruta, listaNumeros);
    }

    // `rota` troca o endpoint do extrator (ex.: '/analyze-bi'); padrão = extração da grade
    async _enviarParaPythonComRetry(buffer, filename, rota = null) {
        const BASE_PYTHON = process.env.VITE_PYTHON_API_URL || process.env.PYTHON_API_URL;
        const PYTHON_API_URL = BASE_PYTHON && rota ? BASE_PYTHON.replace('/extract-pdf', rota) : BASE_PYTHON;

        if (!PYTHON_API_URL) {
            throw new Error("A URL da API Python não está definida nas variáveis de ambiente do backend.");
        }

        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        let body = `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
        body += `Content-Type: application/pdf\r\n\r\n`;

        const footer = `\r\n--${boundary}--\r\n`;

        const multipartBody = Buffer.concat([
            Buffer.from(body, 'utf8'),
            buffer,
            Buffer.from(footer, 'utf8')
        ]);

        const response = await fetch(PYTHON_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': multipartBody.length
            },
            body: multipartBody
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na extração PDF: ${response.status} - ${errorText || response.statusText}`);
        }
        
        return await response.json();
    }

    // Histórico de aulas (BI): devolve o JSON cru do extrator ({ rawRecords, kpis }).
    // Passa pelo backend para exigir login + módulo Relatórios e não expor o
    // endereço do extrator no código do site.
    async analisarBiPdf(buffer) {
        return await this._enviarParaPythonComRetry(buffer, 'historico.pdf', '/analyze-bi');
    }

    async analisarGradeExternaPdf(buffer) {
        const jsonResponse = await this._enviarParaPythonComRetry(buffer, 'historico.pdf');
        return await this.analisarGradeExterna(jsonResponse.records);
    }

    async analisarGradeExterna(dadosCsv) {
        const salasUnicas = [...new Set(dadosCsv.map(d => d.Sala || d.sala))].filter(s => s).sort();
        return this._processarOcupacaoSemanl(dadosCsv, salasUnicas);
    }

    async processarUploadPdf(buffer, predio_id) {
        const jsonResponse = await this._enviarParaPythonComRetry(buffer, 'agenda.pdf');
        return await this.processarUploadCsv(jsonResponse.records, predio_id);
    }

    async processarUploadCsv(dadosCsv, predio_id) {
        if (!predio_id) {
            throw new Error("Falha de Segurança: É obrigatório definir um prédio para importar a grade.");
        }

        const simplificarSala = (codigo) => {
            if (!codigo) return codigo;
            const partes = codigo.split('.');

            if (partes.length >= 5 && partes[0] === 'C') {
                const andar = parseInt(partes[3], 10).toString();
                const sala = partes[4];

                if (sala.startsWith(andar) && sala.length >= 3) {
                    return sala;
                }

                return `${andar}${sala}`;
            }
            return codigo;
        };

        const dadosFormatados = dadosCsv.map(d => ({
            ...d,
            Sala: simplificarSala(d.Sala || d.sala)
        }));

        // Sala que o prédio ainda não conhecia entra como Pendente (oculta até
        // alguém decidir). As existentes não são tocadas: a escolha de
        // visibilidade sobrevive ao re-import.
        const salasExistentes = await gradeRepository.buscarSalasComId(predio_id);
        const primeiraImportacao = salasExistentes.length === 0;
        const numerosNovos = separarSalasNovas(dadosFormatados.map(d => d.Sala), salasExistentes);
        await gradeRepository.inserirSalasNovas(numerosNovos.map(numero => ({ numero, predio_id, status: STATUS_SALA.PENDENTE })));
        const salasDb = numerosNovos.length ? await gradeRepository.buscarSalasComId(predio_id) : salasExistentes;

        const salaMap = {};
        salasDb.forEach(s => { salaMap[s.numero] = s.id });

        const gradeInsert = dadosFormatados.map(d => ({
            sala_id: salaMap[d.Sala] || null,
            dia_semana: d.Dia,
            periodo: extractPeriodCode(d.Periodo),
            nome_aula: d.Nome_da_Aula,
            tipo: isInternalClass(d.Nome_da_Aula) ? 'Interno' : 'Regular',
            predio_id: predio_id
        })).filter(d => d.sala_id !== null);

        await gradeRepository.limparGrade(predio_id);
        await gradeRepository.inserirGradeLote(gradeInsert);
        await this.gerarEPublicarIndexEstatico(predio_id);

        gradeCacheMap[predio_id] = null;
        gradeCacheMap['GLOBAL'] = null;

        // Salas à espera de decisão (as novas desta importação + pendentes de
        // importações anteriores), com o resumo da semana para a pergunta na tela
        const numeroPorId = Object.fromEntries(salasDb.map(s => [s.id, s.numero]));
        const resumo = resumirAgendaPorSala(gradeInsert.map(g => ({ sala: numeroPorId[g.sala_id], nome: g.nome_aula, tipo: g.tipo })));
        const novas = new Set(numerosNovos);
        const salasParaDecidir = salasDb
            .filter(s => s.status === STATUS_SALA.PENDENTE)
            .map(s => ({ numero: s.numero, situacao: 'pendente', nova: novas.has(s.numero), ...(resumo.get(s.numero) || RESUMO_VAZIO) }))
            .sort((a, b) => ordenarNumeros(a.numero, b.numero));

        return { sucesso: true, registrosInseridos: gradeInsert.length, primeiraImportacao, salasParaDecidir };
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

        gradeCacheMap[predio_id] = null;
        gradeCacheMap['GLOBAL'] = null;

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