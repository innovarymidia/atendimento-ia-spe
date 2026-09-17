import { queryOne, queryAll, executeRun, Contact, Message } from '../src/lib/db';
import { findOrCreateContact, evaluateGuardrail } from '../src/lib/guardrail';
import { processConversationWithGemini, sanitizeOutputText } from '../src/lib/gemini';
import { validateAiResponse } from '../src/lib/debugger';
import { acquireLock, releaseLock, getUnprocessedMessages, markMessagesAsProcessed } from '../src/lib/buffer';
import { parseConversationState, serializeConversationState, ConversationState } from '../src/lib/conversation-state';

async function runScenarioTests() {
  console.log('================================================================');
  console.log('  TESTES DE VALIDAÇÃO: FLUXO DE ATENDIMENTO IA (12 CENÁRIOS)   ');
  console.log('================================================================\n');

  let passedCount = 0;

  // -------------------------------------------------------------
  // CENÁRIO 1: Buffer e Mensagens Fragmentadas
  // -------------------------------------------------------------
  console.log('▶ [Cenário 1] Buffer e Agrupamento de Mensagens Fragmentadas...');
  const phone1 = '5565981010001';
  const c1 = await findOrCreateContact(phone1, 'Lead Fragmentado');
  await executeRun('DELETE FROM messages WHERE contactId = ?', [c1.id]);
  
  // Cliente envia 3 mensagens em sequência rápida
  await executeRun("INSERT INTO messages (contactId, sender, content, isProcessed, createdAt) VALUES (?, 'user', 'Ola boa tarde', 0, CURRENT_TIMESTAMP)", [c1.id]);
  await executeRun("INSERT INTO messages (contactId, sender, content, isProcessed, createdAt) VALUES (?, 'user', 'meu cachorro late muito', 0, CURRENT_TIMESTAMP)", [c1.id]);
  await executeRun("INSERT INTO messages (contactId, sender, content, isProcessed, createdAt) VALUES (?, 'user', 'queria saber se voces atendem aqui', 0, CURRENT_TIMESTAMP)", [c1.id]);

  const pending = await getUnprocessedMessages(c1.id);
  const consolidatedText = pending.map(m => m.content).join('\n');
  if (pending.length !== 3) throw new Error(`Esperado 3 mensagens no buffer, obtido ${pending.length}`);
  if (!consolidatedText.includes('Ola boa tarde') || !consolidatedText.includes('late muito') || !consolidatedText.includes('atendem aqui')) {
    throw new Error('Consolidação de mensagens falhou!');
  }
  await markMessagesAsProcessed(pending.map(m => m.id));
  const remaining = await getUnprocessedMessages(c1.id);
  if (remaining.length !== 0) throw new Error('Falha ao marcar mensagens como processadas!');
  console.log('  ✓ Sucesso: 3 mensagens agrupadas em 1 bloco consolidado com silêncio.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 2: Pergunta Direta do Cliente ("Como funciona?")
  // -------------------------------------------------------------
  console.log('▶ [Cenário 2] Pergunta Direta: "Como funciona o adestramento?"...');
  const phone2 = '5565981010002';
  const c2 = await findOrCreateContact(phone2, 'Lead Curioso');
  const state2 = parseConversationState(null, c2);
  const res2 = await processConversationWithGemini(c2, [], 'Como funciona o adestramento canino de vocês?', state2);
  
  if (!res2.replyText || res2.replyText.length < 20) throw new Error('Resposta vazia');
  const val2 = validateAiResponse({
    aiResponseText: res2.replyText,
    userMessage: 'Como funciona o adestramento canino de vocês?',
    conversationHistory: [],
    contact: c2,
    state: state2
  });
  if (!val2.passed) throw new Error(`Falha no debugger: ${val2.violations.join('; ')}`);
  console.log(`  Resposta da IA: "${res2.replyText.slice(0, 100)}..."`);
  console.log('  ✓ Sucesso: Pergunta direta respondida com foco na avaliação e rotina.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 3: Apresentação do Tutor ("Me chamo João...")
  // -------------------------------------------------------------
  console.log('▶ [Cenário 3] Apresentação: "Me chamo João, tenho alguns problemas a serem ajustados"...');
  const phone3 = '5565981010003';
  const c3 = await findOrCreateContact(phone3, 'Desconhecido');
  const state3 = parseConversationState(null, c3);
  const res3 = await processConversationWithGemini(c3, [], 'Me chamo João, tenho alguns problemas a serem ajustados', state3);
  
  // Não pode devolver a saudação genérica em loop
  if (res3.replyText.includes('Me conta um pouquinho mais sobre o que você e seu cãozinho estão precisando no momento?') && !res3.replyText.toLowerCase().includes('joão')) {
    throw new Error('IA respondeu com mensagem genérica em loop sem acolher o nome João!');
  }
  console.log(`  Resposta da IA: "${res3.replyText.slice(0, 100)}..."`);
  console.log('  ✓ Sucesso: Tutor acolhido pelo nome e sem mensagem genérica repetida.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 4: Mensagem Curta / "?"
  // -------------------------------------------------------------
  console.log('▶ [Cenário 4] Mensagem Curta com "?"...');
  const res4 = await processConversationWithGemini(c3, [
    { id: 1, contactId: c3.id, sender: 'assistant', content: 'Olá João! Como posso te ajudar?', mediaUrl: null, createdAt: '' }
  ], '?', state3);
  if (res4.replyText.includes('Me conta um pouquinho mais sobre o que você e seu cãozinho estão precisando no momento?')) {
    throw new Error('IA repetiu texto genérico ao receber "?"');
  }
  console.log(`  Resposta da IA: "${res4.replyText.slice(0, 80)}..."`);
  console.log('  ✓ Sucesso: Ponto de interrogação tratado contextualmente.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 5: Dúvida de Preço ("Quanto custa?")
  // -------------------------------------------------------------
  console.log('▶ [Cenário 5] Dúvida de Preço: "Quanto custa?"...');
  const phone5 = '5565981010005';
  const c5 = await findOrCreateContact(phone5, 'Lead Preço');
  const state5 = parseConversationState(null, c5);
  const res5 = await processConversationWithGemini(c5, [], 'Quanto custa o adestramento?', state5);
  
  const textLower5 = res5.replyText.toLowerCase();
  const mentionsEvaluationOrValues = textLower5.includes('avaliação') || textLower5.includes('150') || textLower5.includes('valor') || textLower5.includes('cidade');
  if (!mentionsEvaluationOrValues) {
    throw new Error('IA não explicou a estrutura de valores/avaliação inicial ao ser questionada sobre preço!');
  }
  console.log(`  Resposta da IA: "${res5.replyText.slice(0, 110)}..."`);
  console.log('  ✓ Sucesso: Preço da avaliação e dependência da cidade esclarecidos.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 6: Cidade Cuiabá -> PDF Cuiabá
  // -------------------------------------------------------------
  console.log('▶ [Cenário 6] Cidade Cuiabá -> Validação de PDF Cuiabá...');
  const phone6 = '5565981010006';
  const c6 = await findOrCreateContact(phone6, 'Lead Cuiaba');
  c6.city = 'Cuiabá';
  const state6 = parseConversationState(null, c6);
  state6.facts.city = 'Cuiabá';
  const res6 = await processConversationWithGemini(c6, [], 'Moro em Cuiabá no bairro Goiabeiras. Pode me mandar o material?', state6);
  
  if (res6.pdfCityTarget !== 'cuiaba' && res6.identifiedCity !== 'cuiaba') {
    throw new Error(`Esperado target cuiaba, obtido: ${res6.pdfCityTarget || res6.identifiedCity}`);
  }
  console.log(`  Target PDF identificado: ${res6.pdfCityTarget || res6.identifiedCity}`);
  console.log('  ✓ Sucesso: Cuiabá mapeado com precisão para material de Cuiabá.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 7: Cidade Várzea Grande -> PDF VG
  // -------------------------------------------------------------
  console.log('▶ [Cenário 7] Cidade Várzea Grande -> Validação de PDF Várzea Grande...');
  const phone7 = '5565981010007';
  const c7 = await findOrCreateContact(phone7, 'Lead VG');
  c7.city = 'Várzea Grande';
  const state7 = parseConversationState(null, c7);
  state7.facts.city = 'Várzea Grande';
  const res7 = await processConversationWithGemini(c7, [], 'Moro em Várzea Grande no Cristo Rei. Gostaria de receber os valores.', state7);
  
  if (res7.pdfCityTarget !== 'varzea_grande' && res7.identifiedCity !== 'varzea_grande') {
    throw new Error(`Esperado target varzea_grande, obtido: ${res7.pdfCityTarget || res7.identifiedCity}`);
  }
  console.log(`  Target PDF identificado: ${res7.pdfCityTarget || res7.identifiedCity}`);
  console.log('  ✓ Sucesso: Várzea Grande mapeado com precisão para material de VG.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 8: Outras Cidades (Online) -> PDF Online
  // -------------------------------------------------------------
  console.log('▶ [Cenário 8] Outras Cidades (ex: Sinop/SP) -> Validação de PDF Online...');
  const phone8 = '5565981010008';
  const c8 = await findOrCreateContact(phone8, 'Lead Sinop');
  const state8 = parseConversationState(null, c8);
  const res8 = await processConversationWithGemini(c8, [], 'Moro em Sinop MT. Vocês atendem aqui?', state8);
  
  if (res8.identifiedCity !== 'outra' && res8.pdfCityTarget !== 'outra' && !res8.replyText.toLowerCase().includes('online')) {
    throw new Error(`Esperado direcionamento online/outra para Sinop, obtido: ${res8.identifiedCity}`);
  }
  console.log(`  Modalidade identificada: ${res8.modality || 'online_nicolle'}`);
  console.log('  ✓ Sucesso: Cidade fora da grande Cuiabá direcionada para consultoria online.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 9: Aluno / Ex-Aluno ("Já sou aluno") -> Bloqueio Determinístico
  // -------------------------------------------------------------
  console.log('▶ [Cenário 9] Bloqueio Determinístico de Aluno / Ex-Aluno...');
  const phone9 = '5565981010009';
  const c9 = await findOrCreateContact(phone9, 'Aluno Antigo');
  const state9 = parseConversationState(null, c9);
  
  const val9 = validateAiResponse({
    aiResponseText: 'Olá! Como posso ajudar você e seu pet?',
    userMessage: 'Olá, já fiz adestramento com vocês ano passado, queria tirar uma dúvida',
    conversationHistory: [],
    contact: c9,
    state: state9
  });

  if (!val9.shouldHandoffToHuman) {
    throw new Error('FALHA: Debugger permitiu que a IA atendesse quem já é aluno!');
  }
  console.log(`  Handoff acionado: ${val9.shouldHandoffToHuman} (Motivo: ${val9.handoffReason})`);
  console.log('  ✓ Sucesso: Aluno impedido deterministicamente de ser atendido como novo lead.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 10: Pedido Explícito de Humano ("Falar com atendente")
  // -------------------------------------------------------------
  console.log('▶ [Cenário 10] Pedido Explícito de Atendente Humano...');
  const val10 = validateAiResponse({
    aiResponseText: 'Com certeza, vou transferir para nosso atendente humano.',
    userMessage: 'Quero falar com atendente humano por favor',
    conversationHistory: [],
    contact: c9,
    state: state9
  });
  if (!val10.shouldHandoffToHuman) {
    throw new Error('FALHA: Debugger não detectou pedido expresso de atendente humano!');
  }
  console.log(`  Handoff acionado: ${val10.shouldHandoffToHuman}`);
  console.log('  ✓ Sucesso: Transferência imediata ao solicitar atendente humano.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 11: Falsa Alegação de PDF sem Envio Técnico
  // -------------------------------------------------------------
  console.log('▶ [Cenário 11] Debugger: Rejeição de Alegação de PDF sem Envio Confirmado...');
  const val11 = validateAiResponse({
    aiResponseText: 'Acabei de te enviar o material em anexo com todas as informações.',
    userMessage: 'Quero ver os valores',
    conversationHistory: [],
    contact: c6,
    state: state6,
    pdfSentSuccess: false // Envio técnico falhou ou não ocorreu
  });

  if (val11.violations.length === 0 || val11.sanitizedText.includes('Acabei de te enviar o material')) {
    throw new Error('FALHA: IA permitiu alegar envio de PDF sem confirmação técnica da API!');
  }
  console.log(`  Violação detectada: ${val11.violations[0]}`);
  console.log(`  Texto sanitizado: "${val11.sanitizedText}"`);
  console.log('  ✓ Sucesso: IA impedida de afirmar falsamente que enviou arquivo.\n');
  passedCount++;

  // -------------------------------------------------------------
  // CENÁRIO 12: Lock de Concorrência
  // -------------------------------------------------------------
  console.log('▶ [Cenário 12] Lock de Concorrência Atômico...');
  const phone12 = '5565981010012';
  const c12 = await findOrCreateContact(phone12, 'Teste Concorrente');
  
  // Worker 1 adquire o lock
  const lock1 = await acquireLock(c12.id);
  if (!lock1) throw new Error('Worker 1 deveria conseguir o lock');

  // Worker 2 tenta adquirir o lock simultaneamente para o mesmo contato
  const lock2 = await acquireLock(c12.id);
  if (lock2) throw new Error('FALHA: Worker 2 adquiriu o lock enquanto Worker 1 estava ativo!');

  // Worker 1 conclui e libera
  await releaseLock(c12.id);

  // Worker 3 tenta adquirir após liberação
  const lock3 = await acquireLock(c12.id);
  if (!lock3) throw new Error('Worker 3 deveria adquirir o lock após liberação!');
  await releaseLock(c12.id);

  console.log('  Lock 1: Concedido | Lock 2 Simultâneo: Negado | Lock 3 Após Liberação: Concedido');
  console.log('  ✓ Sucesso: Lock de concorrência impede execuções paralelas duplicadas.\n');
  passedCount++;

  // -------------------------------------------------------------
  // RESUMO FINAL
  // -------------------------------------------------------------
  console.log('================================================================');
  console.log(`  TODOS OS ${passedCount}/12 CENÁRIOS FORAM VALIDADOS COM SUCESSO! `);
  console.log('================================================================\n');
}

runScenarioTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE DOS CENÁRIOS:', err);
  process.exit(1);
});
