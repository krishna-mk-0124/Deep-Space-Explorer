$files = git status -s -uall | ForEach-Object { $_.Substring(3) }
foreach ($file in $files) {
    if ([string]::IsNullOrWhiteSpace($file)) { continue }
    Write-Host "Committing and pushing: $file"
    git add "$file"
    git commit -m "Update/Add $file" --author="krishna-mk-0124 <krishna0124@gmail.com>"
    git push origin HEAD:main
}
Write-Host "All files pushed."
