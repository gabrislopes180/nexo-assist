/**
 * Parâmetros do tempo real. Constantes, sem variável de ambiente; os testes injetam valores menores.
 * O heartbeat fica bem abaixo dos 130 s de ociosidade do proxy do Next.
 */
export const REALTIME_DEFAULTS = {
  heartbeatMs: 20_000,
  retryMs: 3_000,
  bufferSize: 1_000,
  maxStreamsPerUser: 5,
  maxBufferedBytes: 256 * 1024,
} as const;

export type StreamOptions = {
  heartbeatMs: number;
  retryMs: number;
  maxStreamsPerUser: number;
  maxBufferedBytes: number;
  now: () => Date;
};
