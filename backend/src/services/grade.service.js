const gradeRepository = require('../repositories/grade.repository');

const {
    PERIODS,
    getCurrentPeriod,
    groupConsecutiveClasses,
    extractPeriodCode,
    isInternalClass
} = require('../utils/timeHelpers');

class GradeService {

    async obterProximasAulas(diaSolicitado, periodoReferencia) {
        const gradeBruta = await gradeRepository.buscarGradeCompleta();
        const activePer = periodoReferencia === 'auto' ? getCurrentPeriod() : periodoReferencia;
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);

        const response = {
            dia: diaSolicitado,
            periodoAtualReferencia: activePer,
            labelPeriodoAtual: '',
            emAndamento: [],
            proximas: [],
            todasAsAulas: []
        };

        if (activePer) {
            const pi = PERIODS.findIndex(p => p.code === activePer);
            if (pi >= 0) {
                response.labelPeriodoAtual = PERIODS[pi].lb;
                const aulasAgora = aulasDoDia.filter(d => extractPeriodCode(d.periodo) === activePer);
                response.emAndamento = groupConsecutiveClasses(aulasAgora);

                const nextPeriodCodes = PERIODS.slice(pi + 1, pi + 4).map(p => p.code);
                const aulasFuturas = aulasDoDia.filter(d => nextPeriodCodes.includes(extractPeriodCode(d.periodo)));
                const aulasFuturasAgrupadas = groupConsecutiveClasses(aulasFuturas);

                response.proximas = aulasFuturasAgrupadas.filter(g =>
                    g.periodosFormatados.startsWith(PERIODS[pi + 1]?.code)
                );
            }
        } else {
            response.todasAsAulas = groupConsecutiveClasses(aulasDoDia);
        }
        return response;
    }

    async obterSalasLivres(diaSolicitado) {
        const salasDb = await gradeRepository.buscarSalas();
        const gradeBruta = await gradeRepository.buscarGradeCompleta();
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);

        const usedPeriodCodes = new Set(aulasDoDia.map(d => extractPeriodCode(d.periodo)));
        const activePeriods = PERIODS.filter(p => usedPeriodCodes.has(p.code));

        const salasLivres = salasDb.map(salaRef => {
            const occupiedPeriods = aulasDoDia
                .filter(d => d.salas?.numero === salaRef.numero)
                .map(d => extractPeriodCode(d.periodo));

            const freePeriods = activePeriods.filter(p => !occupiedPeriods.includes(p.code));

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

    async _enviarParaPythonComRetry(buffer, filename) {
        const PYTHON_API_URL = process.env.PYTHON_API_URL || 'https://extrator-pdf-pucrs.onrender.com/extract-pdf';

        const MAX_RETRIES = 10;
        const RETRY_DELAY = 6000;

        console.log(`🚀 Iniciando motor de envio para o Python... URL: ${PYTHON_API_URL}`);

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const formData = new FormData();
            const blob = new Blob([buffer], { type: 'application/pdf' });
            formData.append('file', blob, filename);

            try {
                console.log(`[Node -> Python] Tentativa ${attempt}/${MAX_RETRIES}: Chamando a API...`);

                const response = await fetch(PYTHON_API_URL, {
                    method: 'POST',
                    body: formData
                });

                const textResponse = await response.text();

                if (!response.ok) {
                    console.log(`⚠️ [Node <- Python] Erro HTTP ${response.status}. O servidor ainda pode estar acordando...`);
                    if (attempt < MAX_RETRIES) {
                        await new Promise(res => setTimeout(res, RETRY_DELAY));
                        continue;
                    }
                    throw new Error(`Serviço Python demorou demais ou retornou erro ${response.status}`);
                }

                try {
                    const json = JSON.parse(textResponse);
                    console.log(`✅ [Node <- Python] SUCESSO! JSON lido perfeitamente na tentativa ${attempt}.`);
                    return json;
                } catch (jsonErr) {
                    console.error(`☢️ Falha ao decodificar JSON bruto:`, textResponse.substring(0, 200));
                    throw new Error("Python retornou um formato inválido. Pode ser uma tela de erro do Render.");
                }

            } catch (error) {
                console.log(`⚠️ Falha de rede na tentativa ${attempt}: ${error.message}`);
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    continue;
                }
                throw error;
            }
        }
    }

    async analisarGradeExternaPdf(buffer) {
        try {
            console.log(`📊 [Histórico] Iniciando extração de PDF silenciosa...`);

            const jsonResponse = await this._enviarParaPythonComRetry(buffer, 'historico.pdf');
            const records = jsonResponse.records;

            console.log(`✅ [Histórico] Python processou ${records.length} registros.`);
            return await this.analisarGradeExterna(records);

        } catch (error) {
            console.error("Erro na análise histórica via Python:", error);
            throw new Error("Erro na extração do arquivo: " + error.message);
        }
    }

    async obterTimeline(diaSolicitado) {
        const salasDb = await gradeRepository.buscarSalas();
        const gradeBruta = await gradeRepository.buscarGradeCompleta();
        const aulasDoDia = gradeBruta.filter(d => d.dia_semana === diaSolicitado);
        const periodoAtual = getCurrentPeriod();

        const timeline = salasDb.map(salaRef => {
            const slots = PERIODS.map(p => {
                const aulaNoSlot = aulasDoDia.find(d =>
                    d.salas?.numero === salaRef.numero &&
                    extractPeriodCode(d.periodo) === p.code
                );

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

    async obterStatusPlanta(diaSolicitado, periodoReferencia) {
        const salasDb = await gradeRepository.buscarSalas();
        const gradeBruta = await gradeRepository.buscarGradeCompleta();
        const activePer = periodoReferencia === 'auto' ? getCurrentPeriod() : periodoReferencia;

        const aulasNoMomento = gradeBruta.filter(d =>
            d.dia_semana === diaSolicitado &&
            extractPeriodCode(d.periodo) === activePer
        );

        const salasProcessadas = salasDb.map(s => {
            const aula = aulasNoMomento.find(a => a.salas?.numero === s.numero);
            return {
                numero: s.numero,
                andar: s.andar || s.numero[0],
                ocupada: !!aula,
                disciplina: aula ? (aula.nome_aula || aula.disciplinas?.nome) : null,
                tipo: aula ? (aula.tipo || (isInternalClass(aula.nome_aula) ? 'Interno' : 'Regular')) : 'Livre'
            };
        });

        const andares = ['1', '2', '3'].map(num => ({
            label: `${num}º Andar`,
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

    async realizarBuscaGlobal(q) {
        if (!q || q.length < 2) return [];
        const gradeBruta = await gradeRepository.buscarGradeCompleta();
        const termo = q.toLowerCase();

        const filtrados = gradeBruta.filter(d =>
            d.nome_aula?.toLowerCase().includes(termo) ||
            d.salas?.numero?.toLowerCase().includes(termo) ||
            d.disciplinas?.codigo?.toLowerCase().includes(termo) ||
            d.periodo?.toLowerCase().includes(termo)
        );

        const agrupados = groupConsecutiveClasses(filtrados);
        const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        return agrupados.sort((a, b) => {
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

        return {
            diasDisponiveis: diasSemana,
            salasDisponiveis: salasLista,
            periodosDisponiveis: PERIODS.map(p => p.code),
            ocupacaoBase
        };
    }

    async obterOcupacaoSemanal() {
        const salasDb = await gradeRepository.buscarSalas();
        const gradeBruta = await gradeRepository.buscarGradeCompleta();
        const listaNumeros = salasDb.map(s => s.numero);
        return this._processarOcupacaoSemanl(gradeBruta, listaNumeros);
    }

    async analisarGradeExterna(dadosCsv) {
        const salasUnicas = [...new Set(dadosCsv.map(d => d.Sala || d.sala))].filter(s => s).sort();
        return this._processarOcupacaoSemanl(dadosCsv, salasUnicas);
    }

    async processarUploadPdf(buffer) {
        try {
            console.log(`📡 [Grade] Iniciando extração de PDF silenciosa...`);

            const jsonResponse = await this._enviarParaPythonComRetry(buffer, 'agenda.pdf');

            console.log(`✅ Sucesso! O Python devolveu as aulas formatadas.`);
            return await this.processarUploadCsv(jsonResponse.records);

        } catch (error) {
            console.error("Erro no processamento da grade:", error.message);
            throw new Error(error.message);
        }
    }

    async processarUploadCsv(dadosCsv) {
        const salasUnicas = [...new Set(dadosCsv.map(d => d.Sala))].filter(s => s).map(s => ({ numero: s }));
        const salasDb = await gradeRepository.upsertSalas(salasUnicas);
        const salaMap = {};
        salasDb.forEach(s => { salaMap[s.numero] = s.id });

        const gradeInsert = dadosCsv.map(d => ({
            sala_id: salaMap[d.Sala] || null,
            dia_semana: d.Dia,
            periodo: extractPeriodCode(d.Periodo),
            nome_aula: d.Nome_da_Aula,
            tipo: isInternalClass(d.Nome_da_Aula) ? 'Interno' : 'Regular'
        })).filter(d => d.sala_id !== null);

        await gradeRepository.limparGrade();
        await gradeRepository.inserirGradeLote(gradeInsert);
        return { sucesso: true, registrosInseridos: gradeInsert.length };
    }
}

module.exports = new GradeService();