import cron from 'node-cron'

import { config } from '../config'

type TarefaAgendada = ReturnType<typeof cron.schedule>

/**
 * Cron job do Script Diário: dispara às 00h00 no fuso configurado.
 *
 * Se o processo estiver com `CRON_HABILITADO=false`, quem agenda o script é um
 * cron externo chamando `POST /api/admin/script-diario`.
 */
export function iniciarCronDoScriptDiario(): TarefaAgendada | null {
  if (!config.cronHabilitado) {
    console.log('[cron] script diário desabilitado neste processo (CRON_HABILITADO=false).')
    return null
  }

  const tarefa = cron.schedule(
    '0 0 * * *',
    async () => {
      const { rodarScriptDiario } = await import('../services/script-diario.service')
      const { hojeISO } = await import('../lib/datas')

      try {
        await rodarScriptDiario(hojeISO())
      } catch (erro) {
        console.error('[cron] falha ao rodar o script diário:', erro)
      }
    },
    { timezone: config.fusoHorario },
  )

  console.log(`[cron] script diário agendado para 00h00 (${config.fusoHorario}).`)
  return tarefa
}