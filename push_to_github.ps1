param (
    [Parameter(Mandatory=$false, Position=0)]
    [string]$RepoUrl = "https://github.com/innovarymidia/secretaria-pet-equilibrado.git"
)

Write-Host "Configurando remote origin para: $RepoUrl"
git remote remove origin 2>$null
git remote add origin $RepoUrl
git branch -M main
Write-Host "Enviando commits para o GitHub..."
git push -u origin main
Write-Host "Projeto enviado com sucesso!"
