import { getDb } from '../src/lib/db';
import { cleanPhoneNumber, formatPhoneNumber, getPhoneSearchVariants } from '../src/lib/phone';
import { findOrCreateContact, evaluateGuardrail, assumeAttendance, returnToAi } from '../src/lib/guardrail';
import { sanitizeOutputText } from '../src/lib/gemini';

function runTests() {
  console.log('=== INICIANDO TESTES DO SISTEMA SEU PET EQUILIBRADO ===\n');

  // 1. Teste de Higienização de Telefones
  console.log('[1/5] Testando normalização de números de telefone...');
  const testPhone1 = '65 99999-8888';
  const clean1 = cleanPhoneNumber(testPhone1);
  const formatted1 = formatPhoneNumber(clean1);
  console.log(`   Original: "${testPhone1}" -> Limpo: "${clean1}" -> Formatado: "${formatted1}"`);
  if (clean1 !== '5565999998888') throw new Error('Falha na limpeza do telefone 1');
  if (formatted1 !== '+55 (65) 99999-8888') throw new Error('Falha na formatação do telefone 1');

  // Teste com JID do WhatsApp
  const jidPhone = '5565988887777@s.whatsapp.net';
  const cleanJid = cleanPhoneNumber(jidPhone);
  if (cleanJid !== '5565988887777') throw new Error('Falha na limpeza de JID do WhatsApp');
  console.log('   ✓ Testes de normalização e JID aprovados!');

  // 2. Teste de Sanitização de Regras de Formatação (Regra 30)
  console.log('\n[2/5] Testando regra rígida de formatação (Regra 30)...');
  const dirtyText = 'Olá! Somos a Seu Pet Equilibrado — adestramento & consultoria comportamental – sem aversivos.';
  const sanitized = sanitizeOutputText(dirtyText);
  console.log(`   Original: "${dirtyText}"`);
  console.log(`   Sanitizado: "${sanitized}"`);
  if (sanitized.includes('—') || sanitized.includes('–') || sanitized.includes('&')) {
    throw new Error('Falha na sanitização: caracteres proibidos encontrados!');
  }
  if (!sanitized.includes(' e ')) {
    throw new Error('Falha: & não foi convertido para " e "');
  }
  console.log('   ✓ Regra 30 (proibição de travessão longo, médio e &) aprovada!');

  // 3. Teste do Guardrail Determinístico (Regras 1, 2, 3, 4, 24, 25)
  console.log('\n[3/5] Testando Guardrail Determinístico (Segurança Pré-IA)...');
  const db = getDb();

  // Teste com Aluno Atual
  const aluno = findOrCreateContact('65 91111-0001', 'Aluno Teste');
  db.prepare("UPDATE contacts SET category = 'aluno' WHERE id = ?").run(aluno.id);
  const updatedAluno = db.prepare('SELECT * FROM contacts WHERE id = ?').get(aluno.id) as any;
  const guardAluno = evaluateGuardrail(updatedAluno);
  console.log(`   Aluno (${updatedAluno.phone}): Liberado IA? ${guardAluno.allowed} (Motivo: ${guardAluno.reason})`);
  if (guardAluno.allowed !== false) throw new Error('FALHA GRAVE: Aluno não foi bloqueado pela proteção determinística!');

  // Teste com Contato Bloqueado
  const bloqueado = findOrCreateContact('65 91111-0002', 'Contato Bloqueado');
  db.prepare('UPDATE contacts SET blocked = 1 WHERE id = ?').run(bloqueado.id);
  const updatedBloqueado = db.prepare('SELECT * FROM contacts WHERE id = ?').get(bloqueado.id) as any;
  const guardBloqueado = evaluateGuardrail(updatedBloqueado);
  console.log(`   Bloqueado (${updatedBloqueado.phone}): Liberado IA? ${guardBloqueado.allowed} (Motivo: ${guardBloqueado.reason})`);
  if (guardBloqueado.allowed !== false) throw new Error('FALHA GRAVE: Contato bloqueado não foi silenciado!');

  // Teste com Equipe Interna
  const equipe = findOrCreateContact('65 91111-0003', 'João Eduardo');
  db.prepare("UPDATE contacts SET category = 'equipe' WHERE id = ?").run(equipe.id);
  const updatedEquipe = db.prepare('SELECT * FROM contacts WHERE id = ?').get(equipe.id) as any;
  const guardEquipe = evaluateGuardrail(updatedEquipe);
  console.log(`   Equipe (${updatedEquipe.phone}): Liberado IA? ${guardEquipe.allowed} (Motivo: ${guardEquipe.reason})`);
  if (guardEquipe.allowed !== false) throw new Error('FALHA GRAVE: Equipe interna não foi silenciada!');

  // Teste com Novo Lead Real
  const novoLead = findOrCreateContact('65 91111-0004', 'Novo Tutor');
  const guardNovoLead = evaluateGuardrail(novoLead);
  console.log(`   Novo Lead (${novoLead.phone}): Liberado IA? ${guardNovoLead.allowed} (Motivo: ${guardNovoLead.reason})`);
  if (guardNovoLead.allowed !== true) throw new Error('FALHA: Novo lead válido foi indevidamente bloqueado!');

  console.log('   ✓ Guardrail Determinístico 100% validado!');

  // 4. Teste das Ações: "Assumir Atendimento" e "Devolver para IA"
  console.log('\n[4/5] Testando botão "Assumir Atendimento" e "Devolver para IA"...');
  assumeAttendance(novoLead.id);
  const leadAssumido = db.prepare('SELECT * FROM contacts WHERE id = ?').get(novoLead.id) as any;
  console.log(`   Após Assumir: aiActive = ${leadAssumido.aiActive}, status = "${leadAssumido.status}"`);
  if (leadAssumido.aiActive !== 0 || leadAssumido.status !== 'atendimento_humano') {
    throw new Error('Falha ao assumir atendimento humano');
  }

  const guardAssumido = evaluateGuardrail(leadAssumido);
  if (guardAssumido.allowed !== false) {
    throw new Error('FALHA GRAVE: Lead assumido por humano não silenciou a IA!');
  }
  console.log('   ✓ Assumir atendimento silencia a IA na hora!');

  returnToAi(novoLead.id);
  const leadDevolvido = db.prepare('SELECT * FROM contacts WHERE id = ?').get(novoLead.id) as any;
  console.log(`   Após Devolver: aiActive = ${leadDevolvido.aiActive}, status = "${leadDevolvido.status}"`);
  if (leadDevolvido.aiActive !== 1 || leadDevolvido.status !== 'em_atendimento_ia') {
    throw new Error('Falha ao devolver para a IA');
  }
  console.log('   ✓ Devolver para a IA restaura o atendimento!');

  // 5. Teste de Configuração dos PDFs por Cidade (Regras 18 & 21)
  console.log('\n[5/5] Testando persistência das configurações de PDFs...');
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const cuiaba = getSetting.get('pdfCuiabaUrl') as any;
  const vg = getSetting.get('pdfVgUrl') as any;
  const online = getSetting.get('pdfOnlineUrl') as any;
  console.log(`   PDF Cuiabá: ${cuiaba?.value}`);
  console.log(`   PDF Várzea Grande: ${vg?.value}`);
  console.log(`   PDF Online: ${online?.value}`);
  if (!cuiaba?.value || !vg?.value || !online?.value) {
    throw new Error('Falha nas configurações de PDFs por cidade');
  }
  console.log('   ✓ Configurações de PDFs validadas com sucesso!');

  console.log('\n=== TODOS OS TESTES PASSARAM COM SUCESSO! 100% OPERACIONAL ===');
}

runTests();
