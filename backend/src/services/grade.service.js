const gradeRepository = require('../repositories/grade.repository');
const {
    PERIODS, getCurrentPeriod, groupConsecutiveClasses, extractPeriodCode, isInternalClass
} = require('../utils/timeHelpers');

const gradeCacheMap = {};

class GradeService {

    
    async _obterGradeOtimizada(predio_id) {
        const cacheKey = predio_id || 'GLOBAL';

        if (gradeCacheMap[cacheKey]) {
            return gradeCacheMap[cacheKey];
        }

        console.log(`🔄 Buscando grade no Supabase para ${cacheKey}...`);
        gradeCacheMap[cacheKey] = await gradeRepository.buscarGradeCompleta(predio_id);

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

                response.emAndamento = todasAgrupadas.filter(g => g.periodosFormatados.includes(activePer));
                const nextPeriodCodes = PERIODS.slice(pi + 1, pi + 3).map(p => p.code);
                response.proximas = todasAgrupadas.filter(g => nextPeriodCodes.includes(g.periodosFormatados[0]));
                const futurePeriodCodes = PERIODS.slice(pi + 3).map(p => p.code);
                response.restoDoDia = todasAgrupadas.filter(g => futurePeriodCodes.includes(g.periodosFormatados[0]));
            }
        } else {
            response.todasAsAulas = groupConsecutiveClasses(aulasDoDia);
        }
        return response;
    }

    async obterSalasLivres(diaSolicitado, predio_id) {
        const gradeBruta = await this._obterGradeOtimizada(predio_id);
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);

        const usedPeriodCodes = new Set(aulasDoDia.map(d => extractPeriodCode(d.periodo)));
        const activePeriods = PERIODS.filter(p => usedPeriodCodes.has(p.code));

        const salasDb = await gradeRepository.buscarSalas(predio_id);

        const salasLivres = salasDb.map(salaRef => {
            const occupiedPeriods = aulasDoDia
                .filter(d => d.salas?.numero === salaRef.numero)
                .map(d => extractPeriodCode(d.periodo));

            const freePeriods = activePeriods.filter(p => !occupiedPeriods.includes(p.code));

            return {
                sala: salaRef.numero,
                quantidadeLivres: freePeriods.length,
                periodos: freePeriods.map(f => ({
                    code: f.code, label: f.lb, fim: `${String(f.end[0]).padStart(2, '0')}:${String(f.end[1]).padStart(2, '0')}`
                }))
            };
        });

        return salasLivres.filter(s => s.quantidadeLivres > 0);
    }

    async obterTimeline(diaSolicitado, predio_id) {
        const salasDb = await gradeRepository.buscarSalas(predio_id);
        const gradeBruta = await this._obterGradeOtimizada(predio_id);

        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);
        const periodoAtual = getCurrentPeriod();

        const timeline = salasDb.map(salaRef => {
            const slots = PERIODS.map(p => {
                const aulaNoSlot = aulasDoDia.find(d => d.salas?.numero === salaRef.numero && extractPeriodCode(d.periodo) === p.code);
                return {
                    periodo: p.code, horario: p.lb, isAgora: p.code === periodoAtual, ocupado: !!aulaNoSlot,
                    nome: aulaNoSlot ? (aulaNoSlot.nome_aula || aulaNoSlot.disciplinas?.nome) : null,
                    tipo: aulaNoSlot ? (aulaNoSlot.tipo || (isInternalClass(aulaNoSlot.nome_aula) ? 'Interno' : 'Regular')) : 'Livre'
                };
            });
            return { sala: salaRef.numero, temAulaAgora: slots.some(s => s.isAgora && s.ocupado), slots };
        });

        return { dia: diaSolicitado, periodosCabecalho: PERIODS.map(p => ({ code: p.code, label: p.lb, isAgora: p.code === periodoAtual })), timeline };
    }

    async obterStatusPlanta(diaSolicitado, periodoReferencia, predio_id) {
        const salasDb = await gradeRepository.buscarSalas(predio_id);
        const gradeBruta = await this._obterGradeOtimizada(predio_id);
        const activePer = periodoReferencia === 'auto' ? getCurrentPeriod() : periodoReferencia;

        const aulasNoMomento = gradeBruta.filter(d => d.dia_semana === diaSolicitado && extractPeriodCode(d.periodo) === activePer);

        const salasProcessadas = salasDb.map(s => {
            const aula = aulasNoMomento.find(a => a.salas?.numero === s.numero);

            
            let andarDaSala = s.andar;
            if (!andarDaSala) {
                const partes = s.numero.split('.');
                
                if (partes.length >= 4 && partes[0] === 'C') {
                    
                    andarDaSala = parseInt(partes[3], 10).toString();
                } else {
                    
                    const match = s.numero.match(/\d/);
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
        });

        
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

    async realizarBuscaGlobal(q, predio_id) {
        if (!q || q.length < 2) return [];
        const gradeBruta = await this._obterGradeOtimizada(predio_id);

        const normalizarTexto = (texto) => texto ? texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
        const termoPesquisado = normalizarTexto(q);

        const filtrados = gradeBruta.filter(d => {
            const nomeNormalizado = normalizarTexto(d.nome_aula || d.disciplinas?.nome);
            const salaNormalizada = normalizarTexto(d.salas?.numero || d.sala);
            const codigoNormalizado = normalizarTexto(d.disciplinas?.codigo);

            return nomeNormalizado.includes(termoPesquisado) || salaNormalizada.includes(termoPesquisado) || codigoNormalizado.includes(termoPesquisado);
        });

        const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        let resultados = [];

        dias.forEach(dia => {
            const aulasDoDia = filtrados.filter(f => f.dia_semana === dia || f.Dia === dia);
            if (aulasDoDia.length > 0) {
                const agrupadas = groupConsecutiveClasses(aulasDoDia);
                agrupadas.forEach(aula => { aula.dia_semana = dia; resultados.push(aula); });
            }
        });

        return resultados.sort((a, b) => {
            if (a.dia_semana !== b.dia_semana) return dias.indexOf(a.dia_semana) - dias.indexOf(b.dia_semana);
            return a.sala.localeCompare(b.sala, undefined, { numeric: true });
        }).slice(0, 15);
    }

    _processarOcupacaoSemanl(gradeBruta, salasLista) {
        const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        const ocupacaoBase = gradeBruta.map(g => ({
            sala: g.salas?.numero || g.Sala || g.sala,
            dia: g.dia_semana || g.Dia || g.dia,
            periodo: extractPeriodCode(g.periodo || g.Periodo)
        })).filter(item => item.sala && item.dia);

        return { diasDisponiveis: diasSemana, salasDisponiveis: salasLista, periodosDisponiveis: PERIODS.map(p => p.code), ocupacaoBase };
    }

    async obterOcupacaoSemanal(predio_id) {
        const salasDb = await gradeRepository.buscarSalas(predio_id);
        const gradeBruta = await this._obterGradeOtimizada(predio_id);
        const listaNumeros = salasDb.map(s => s.numero);
        return this._processarOcupacaoSemanl(gradeBruta, listaNumeros);
    }

    async _enviarParaPythonComRetry(buffer, filename) {
        const PYTHON_API_URL = process.env.PYTHON_API_URL || 'https://extrator-pdf-pucrs.onrender.com/extract-pdf';
        const formData = new FormData();
        formData.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
        const response = await fetch(PYTHON_API_URL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Erro Python");
        return await response.json();
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

        
        const salasUnicas = [...new Set(dadosFormatados.map(d => d.Sala))].filter(s => s).map(s => ({ numero: s, predio_id }));
        const salasDb = await gradeRepository.upsertSalas(salasUnicas);

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

        gradeCacheMap[predio_id] = null;
        gradeCacheMap['GLOBAL'] = null;

        return { sucesso: true, registrosInseridos: gradeInsert.length };
    }
}

module.exports = new GradeService();