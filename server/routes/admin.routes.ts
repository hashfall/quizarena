import { Router } from 'express'
import { z } from 'zod'

import { config } from '../config'
import { hojeISO } from '../lib/datas'
import { corpo, ErroHttp, rota } from '../lib/http'
import { rodarScriptDiario } from '../services/script-diario.service'

export const rotasAdmin = Router()

const esquemaExecucao = z.object({
  /**
   * Data a ser tratada como "hoje" pelo script. O padrão é a data atual, e o
   * script fecha o dia anterior. Informar o dia seguinte simula a virada para
   * conferir o fechamento de hoje sem esperar a meia-noite.
   */
  hoje: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
    .optional(),
})

/**
 * POST /api/admin/script-diario
 *
 * Script Diário do fluxograma. O cron job interno dispara sozinho às 00h00,
 * mas a rota existe para um cron externo (do servidor, do Manus ou do
 * Cloud Scheduler) e para rodar o ciclo manualmente durante os testes.
 *
 * Sem `CRON_SEGREDO` definido no ambiente, a rota fica liberada — aceitável em
 * desenvolvimento, mas em produção defina a variável.
 *
 *   curl -X POST localhost:6767/api/admin/script-diario -d '{}'
 *   curl -X POST localhost:6767/api/admin/script-diario -d '{"hoje":"2026-10-01"}'
 */
rotasAdmin.post(
  '/script-diario',
  rota(async (req, res) => {
    if (config.segredoCron) {
      const informado = req.header('x-cron-segredo')
      if (informado !== config.segredoCron) {
        throw new ErroHttp(401, 'Segredo do cron inválido.')
      }
    }

    const { hoje } = corpo(req, esquemaExecucao)
    const relatorio = await rodarScriptDiario(hoje ?? hojeISO())
    res.json(relatorio)
  }),
)

/** GET /api/admin/saude — diagnóstico rápido do servidor. */
rotasAdmin.get(
  '/saude',
  rota(async (_req, res) => {
    res.json({
      ok: true,
      ambiente: config.isProducao ? 'produção' : 'desenvolvimento',
      fusoHorario: config.fusoHorario,
      totalQuestoesDia: config.totalQuestoesDia,
      cronHabilitado: config.cronHabilitado,
    })
  }),
)