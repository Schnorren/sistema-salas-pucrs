const gradeRepository = require('../repositories/grade.repository');

const pdfParse = require('pdf-parse'); // Adicione no topo do arquivo


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
        // Extrai o texto cru do PDF
        const data = await pdfParse(buffer);
        const lines = data.text.split('\n');

        const records = [];
        let currentRoom = '';
        let dayHeaders = [];

        // Regexes equivalentes ao seu Python
        const ROOM_RE = /C\.15\.A\.(\d{2})\.(\d{2})/;
        const PERIOD_RE = /^(\d{2}:\d{2})([A-Z][0-9]?)/;

        const PERIOD_LABEL = {
            'A': 'A (08:00-08:45)', 'B': 'B (08:45-09:30)', 'C': 'C (09:45-10:30)',
            'D': 'D (10:30-11:15)', 'E': 'E (11:30-12:15)', 'E1': 'E1 (12:15-13:00)',
            'F': 'F (14:00-14:45)', 'G': 'G (14:45-15:30)', 'H': 'H (15:45-16:30)',
            'I': 'I (16:30-17:15)', 'J': 'J (17:30-18:15)', 'K': 'K (18:15-19:00)',
            'L': 'L (19:15-20:00)', 'M': 'M (20:00-20:45)', 'N': 'N (21:00-21:45)',
            'P': 'P (21:45-22:30)'
        };

        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Busca código da sala
            const roomMatch = trimmed.match(ROOM_RE);
            if (roomMatch) {
                const andar = parseInt(roomMatch[1], 10) || 0;
                currentRoom = `${andar}${roomMatch[2]}`;
                continue;
            }

            // Busca cabeçalho de dias
            if (trimmed.includes('Segunda') && trimmed.includes('Terça')) {
                dayHeaders = trimmed.split(/\s+/).filter(d =>
                    ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].includes(d)
                );
                continue;
            }

            // Busca a linha de aulas (que inicia com horário)
            const periodMatch = trimmed.match(PERIOD_RE);
            if (periodMatch && currentRoom && dayHeaders.length > 0) {
                const periodLetter = periodMatch[2];
                const periodLabel = PERIOD_LABEL[periodLetter] || periodLetter;

                // Remove o bloco de horário da linha e divide o resto usando 2 ou mais espaços
                // Isso emula o comportamento de colunas de uma tabela
                let classesStr = trimmed.replace(PERIOD_RE, '').trim();
                const classes = classesStr.split(/\s{2,}/);

                classes.forEach((className, idx) => {
                    // Ignora traços, vazios, ou lixo do rodapé (ex: Data: 12/03/2026)
                    if (className && className !== '-' && !className.includes('Data:') && idx < dayHeaders.length) {
                        records.push({
                            Sala: currentRoom,
                            Dia: dayHeaders[idx],
                            Periodo: periodLabel,
                            Nome_da_Aula: className.trim()
                        });
                    }
                });
            }
        }

        if (records.length === 0) {
            throw new Error("Não foi possível extrair dados válidos deste PDF. Verifique o padrão do arquivo.");
        }

        // Reutiliza a lógica de inserção no banco de dados que já existe!
        return await this.processarUploadCsv(records);
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