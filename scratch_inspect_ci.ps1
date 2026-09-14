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
$runId = "34819444342"
$jobs = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs/$runId/jobs" -Headers $headers).jobs
$job = $jobs[0]
Write-Host "Job ID: $($job.id), Conclusion: $($job.conclusion)"
foreach ($step in $job.steps) {
    Write-Host "Step $($step.number): $($step.name) -> $($step.conclusion)"
}

$logUrl = "https://api.github.com/repos/$repo/actions/jobs/$($job.id)/logs"
Write-Host "Fetching log from $logUrl..."
try {
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("Authorization", "Bearer $token")
    $wc.Headers.Add("User-Agent", "PowerShell")
    $wc.DownloadFile($logUrl, "$PWD\ci_job_$runId.log")
    Write-Host "Saved log to ci_job_$runId.log. Length: $((Get-Item ci_job_$runId.log).Length)"
} catch {
    Write-Host "Download failed: $_"
}
