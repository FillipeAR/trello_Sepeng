/**
 * Template pronto pra "Usar organograma padrão" na tela Equipe da Obra — o
 * formato do organograma de referência que a Sepeng mandou (Diretores →
 * Gerente de Contrato → Gerentes de área → cargos de departamento). Só o
 * ponto de partida: os cargos continuam 100% editáveis depois de aplicados
 * (é a mesma escrita real via `createPosition`, sem nada de mágico).
 */
export interface TeamPositionTemplateNode {
  title: string;
  sector?: string;
  children?: TeamPositionTemplateNode[];
}

export const SEPENG_DEFAULT_TEMPLATE: TeamPositionTemplateNode[] = [
  { title: "Diretor", sector: "Diretoria" },
  { title: "Diretor", sector: "Diretoria" },
  {
    title: "Diretor",
    sector: "Diretoria",
    children: [
      {
        title: "Gerente de Contrato",
        sector: "Gestão",
        children: [
          {
            title: "Gerente de Produção",
            sector: "Produção",
            children: [
              {
                title: "Segurança do Trabalho",
                sector: "Segurança",
                children: [{ title: "Engenheiro de Segurança" }, { title: "Supervisora" }],
              },
              {
                title: "Projetos",
                sector: "Projetos",
                children: [{ title: "Coordenador de Projeto" }],
              },
            ],
          },
          {
            title: "Gerente de Engenharia",
            sector: "Engenharia",
            children: [
              { title: "Qualidade", children: [{ title: "Engenheiro Civil - Qualidade" }] },
              { title: "Planejamento", children: [{ title: "Coordenador de Planejamento" }] },
              { title: "Custos e Medição", children: [{ title: "Engenheiro" }] },
              { title: "ADM de Obra", children: [{ title: "Funcionário" }] },
            ],
          },
        ],
      },
    ],
  },
];
