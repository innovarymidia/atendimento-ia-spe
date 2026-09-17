Write-Host "Adicionando arquivos..." -ForegroundColor Cyan
git add .
$msg = Read-Host "Mensagem do commit (pressione Enter para padrão)"
if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "update: atendimento ia spe - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
git commit -m $msg
Write-Host "Enviando para o GitHub..." -ForegroundColor Cyan
git push origin main
Write-Host "Concluído com sucesso!" -ForegroundColor Green
