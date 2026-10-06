Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$b = New-Object System.Drawing.Bitmap($vs.Width, $vs.Height)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $b.Size)
$b.Save("$env:TEMP\screen.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("saved " + $vs.Width + "x" + $vs.Height)
