// Exemplo de spec documentada (padrão POP Enpro). Copie para e2e/<fluxo>.spec.ts e adapte.
// Teste comum:           npx playwright test e2e/<fluxo>.spec.ts
// Gerar POP + execução:  CT_DOCS=1 CT_ISSUE=12 CT_SHA=$(git rev-parse --short HEAD) npx playwright test e2e/<fluxo>.spec.ts --project=chromium
// Textos do POP (Nº, equipe, objetivos, ações corretivas…): docs/pop/cadastro-cliente.pop.json
import { test, expect } from './support/documentador';

test('cadastro de cliente', async ({ page, doc }) => {
  doc.iniciar({ fluxo: 'cadastro-cliente', titulo: 'Cadastro de clientes' });
  await page.goto('/clientes');

  doc.atividade('Cadastrar um cliente, tela /clientes (uso do atendente)',
    'É a tela onde o atendente registra novos clientes. Exige login com perfil Atendente.');

  await doc.tela('Conhecer a tela de clientes', 'Ao abrir, a tela mostra o botão de cadastro e a lista atual.', [
    { alvo: page.getByRole('heading', { name: 'Clientes' }), rotulo: 'Título da tela, confirmando que você está em Clientes.' },
    { alvo: page.getByRole('button', { name: 'Novo cliente' }), rotulo: 'Botão "Novo cliente", usado no passo 1.2.' },
  ], { legenda: 'Tela inicial de clientes' });

  await doc.passo('Abrir o formulário', 'Clique em "Novo cliente". O formulário aparece logo abaixo.',
    page.getByRole('button', { name: 'Novo cliente' }), a => a.click());

  await doc.tela('Preencher os dados', 'Preencha os campos na ordem indicada.', [
    { alvo: page.getByLabel('Nome'), rotulo: 'Nome completo do cliente.' },
    { alvo: page.getByLabel('E-mail'), rotulo: 'E-mail válido; ele será o login do cliente.' },
    { alvo: page.getByRole('button', { name: 'Salvar' }), rotulo: 'Salvar, que grava o cadastro.' },
  ], { legenda: 'Formulário de cadastro', atencao: 'O e-mail não pode repetir um cliente já cadastrado.' });

  await page.getByLabel('Nome').fill('Ana Souza');
  await page.getByLabel('E-mail').fill('ana@exemplo.com');

  await doc.passo('Salvar o cadastro', 'Clique em "Salvar". O sistema valida e grava.',
    page.getByRole('button', { name: 'Salvar' }), a => a.click());

  await expect(page.getByRole('status')).toHaveText(/cliente cadastrado/i);
  await doc.passo('Conferir a confirmação', 'A mensagem de confirmação aparece e o cliente entra na lista.',
    page.getByRole('status'), undefined, { rotulo: 'Mensagem de confirmação do cadastro.' });
});
