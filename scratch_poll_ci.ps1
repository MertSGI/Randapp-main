$cred = ("protocol=https`nhost=github.com" | git credential fill)
$token = ""
foreach ($line in ($cred -split "`n")) {
    if ($line.StartsWith("password=")) {
        $token = $line.Substring(9).Trim()
    }
}
$repo = "MertSGI/Randapp-main"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "PowerShell"
}
$runs = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs?branch=ci/phase6-node1-product-inventory-acceptance-r1" -Headers $headers).workflow_runs
$latest = $runs[0]
Write-Host "Run ID: $($latest.id)"
Write-Host "Status: $($latest.status)"
Write-Host "Conclusion: $($latest.conclusion)"
Write-Host "Commit: $($latest.head_sha)"
Write-Host "URL: $($latest.html_url)"
