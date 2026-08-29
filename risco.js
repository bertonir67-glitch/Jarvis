// Duas decisões que a agenda e a camada de receita precisam tomar juntas.
// Vive num módulo próprio para não criar dependência circular entre elas.
import * as bd from './db.js';

/**
 * Classifica o histórico do cliente. Não é punição: decide se vale pedir
 * sinal e é o que o dono vê antes de encaixar alguém no horário nobre.
 */
export function riscoDeFalta(cliente) {
  const faltas = Number(cliente?.total_faltas) || 0;
  const visitas = Number(cliente?.total_visitas) || 0;
  const total = faltas + visitas;

  if (total === 0) return { nivel: 'novo', motivo: 'primeira vez aqui', faltas, visitas };
  const taxa = faltas / total;

  if (faltas >= 2 && taxa >= 0.25) {
    return { nivel: 'alto', motivo: `faltou ${faltas} de ${total} vezes`, faltas, visitas };
  }
  if (faltas >= 1) {
    return { nivel: 'medio', motivo: `${faltas} falta${faltas > 1 ? 's' : ''} no histórico`, faltas, visitas };
  }
  return { nivel: 'baixo', motivo: `${visitas} atendimento${visitas > 1 ? 's' : ''} sem falta`, faltas, visitas };
}

/** Quanto cobrar de sinal deste cliente neste serviço. 0 = não cobrar. */
export function sinalDevido(servico, cliente, negocio = bd.lerNegocio()) {
  if (!negocio.sinal_ativo || !negocio.pix_chave) return 0;
  const valor = Number(servico?.sinal) || 0;
  if (valor <= 0) return 0;
  if (!negocio.sinal_so_risco) return valor;
  return ['alto', 'medio', 'novo'].includes(riscoDeFalta(cliente).nivel) ? valor : 0;
}
