import { describe, expect, it } from "vitest";
import { buildTicketDetail } from "./test-fixtures";
import { ticketDetailFields } from "./ticket-detail-fields";

const now = new Date("2026-11-03T10:00:00");
const field = (fields: ReturnType<typeof ticketDetailFields>, label: string) =>
  fields.find((item) => item.label === label);

describe("ticketDetailFields", () => {
  it("monta a grade do detalhe na ordem", () => {
    const fields = ticketDetailFields(
      buildTicketDetail({
        dueAt: "2026-11-03T13:43:00",
        createdAt: "2026-11-03T09:40:00",
        updatedAt: "2026-11-03T09:45:00",
      }),
      now,
    );
    expect(fields.map((item) => item.label)).toEqual([
      "Categoria",
      "Prioridade",
      "Prazo",
      "Aberto em",
      "Última atualização",
      "Afetados",
      "Funcionário",
    ]);
    expect(field(fields, "Categoria")?.value).toBe("Rede e VPN");
    expect(field(fields, "Prioridade")).toMatchObject({
      value: "Alta",
      dot: "warning",
    });
    expect(field(fields, "Prazo")).toEqual({
      label: "Prazo",
      value: "03 nov, 13:43",
    });
    expect(field(fields, "Funcionário")).toMatchObject({
      value: "Ana Souza",
      note: "· Financeiro",
      wide: true,
    });
  });

  it("prazo vencido em warning", () => {
    const fields = ticketDetailFields(
      buildTicketDetail({ dueAt: "2026-11-03T08:00:00", overdue: true }),
      now,
    );
    expect(field(fields, "Prazo")).toEqual({
      label: "Prazo",
      value: "03 nov, 08:00",
      tone: "warning",
      note: "· prazo vencido",
    });
  });

  it("prazo pausado aguardando o funcionário", () => {
    const fields = ticketDetailFields(
      buildTicketDetail({
        status: "WAITING_EMPLOYEE",
        dueAt: null,
        slaPaused: true,
      }),
      now,
    );
    expect(field(fields, "Prazo")).toEqual({
      label: "Prazo",
      value: "Pausado",
      note: "· aguardando funcionário",
    });
  });

  it("resolvido mostra quando terminou no lugar do prazo", () => {
    const fields = ticketDetailFields(
      buildTicketDetail({
        status: "RESOLVED",
        dueAt: null,
        resolvedAt: "2026-10-16T14:20:00",
      }),
      now,
    );
    expect(field(fields, "Prazo")).toBeUndefined();
    expect(field(fields, "Resolvido em")?.value).toBe("16 out, 14:20");
  });

  it("afetados com a descrição e funcionário sem departamento", () => {
    const fields = ticketDetailFields(
      buildTicketDetail({
        affectedScope: "TEAM",
        affectedDescription: "Time de cobrança",
        owner: { id: "u1", name: "Ana Souza", department: null },
      }),
      now,
    );
    expect(field(fields, "Afetados")).toEqual({
      label: "Afetados",
      value: "Equipe",
      note: "· Time de cobrança",
      wide: true,
    });
    expect(field(fields, "Funcionário")).toEqual({
      label: "Funcionário",
      value: "Ana Souza",
      wide: true,
    });
  });
});
