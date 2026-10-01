import { config } from '../config'

/**
 * Toda a lógica do quiz roda em horário de Brasília, então o "dia" nunca pode
 * depender do fuso da máquina que hospeda o servidor.
 */
const formatadorData = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.fusoHorario,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: config.fusoHorario,
  day: '2-digit',
  month: 'short',
})

export function hojeISO(): string {
  return formatadorData.format(new Date())
}

export function deslocarDia(dataISO: string, dias: number): string {
  // Evita depender do parser do Node ao reinterpretar "YYYY-MM-DD".
  const [ano, mes, dia] = dataISO.split('-').map(Number) as [number, number, number]
  const referencia = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return referencia.toISOString().slice(0, 10)
}

export function rotuloData(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number) as [number, number, number]
  const referencia = new Date(Date.UTC(ano, mes - 1, dia, 12))
  const texto = formatadorDataHora.format(referencia).replace('.', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}