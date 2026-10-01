import { config } from '../config'
import { hojeISO } from '../lib/datas'
import { obterFirestore } from '../firebase'
import { iniciarCronDoScriptDiario } from '../jobs/cron'

/**
 * Processo dedicado apenas ao cron job, para os casos em que o servidor web e
 * o agendamento precisam ficar separados:
 *
 *   npm run cron
 *
 * No servidor web, use `CRON_HABILITADO=false` para não duplicar o agendamento.
 */
async function main(): Promise<void> {
  console.log('[cron] conectando ao Firestore...')
  obterFirestore()

  console.log(`[cron] processo iniciado em ${hojeISO()} (${config.fusoHorario}).`)
  iniciarCronDoScriptDiario()

  // Mantém o processo vivo: o node-cron cuida do agendamento.
  setInterval(() => {}, 1 << 30)
}

main().catch((erro: unknown) => {
  console.error('[cron] falha ao iniciar:', erro)
  process.exit(1)
})