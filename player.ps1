# Persistent audio helper for Windows. Reads one command per line on stdin, prints one event per line.
#   load <path> | pause | resume | stop | vol <0..1> | seek <secs> | quit
#   ->  ready | started <secs> | pos <secs> <dur> | ended | error <message>
[Console]::InputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName PresentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$q = New-Object System.Collections.Concurrent.ConcurrentQueue[string]
$rs = [runspacefactory]::CreateRunspace(); $rs.Open()
$ps = [powershell]::Create(); $ps.Runspace = $rs
[void]$ps.AddScript({ param($q) while (($l = [Console]::In.ReadLine()) -ne $null) { $q.Enqueue($l) }; $q.Enqueue('quit') }).AddArgument($q)
[void]$ps.BeginInvoke()
$active = $false; $started = $false; $tick = 0
"ready"; [Console]::Out.Flush()
while ($true) {
  $line = $null
  while ($q.TryDequeue([ref]$line)) {
    $cmd, $arg = $line -split ' ', 2
    switch ($cmd) {
      'load'   {
        # The first Open right after start-up can fail while the media engine warms up, so retry.
        $ok = $false
        foreach ($try in 1..4) { try { $p.Open([Uri]$arg); $ok = $true; break } catch { Start-Sleep -Milliseconds 500 } }
        if ($ok) { $p.Play(); $active = $true; $started = $false } else { "error could not open audio"; [Console]::Out.Flush() }
      }
      'pause'  { $p.Pause() }
      'resume' { $p.Play() }
      'stop'   { $p.Stop(); $p.Close(); $active = $false }
      'vol'    { $p.Volume = [double]::Parse($arg, [Globalization.CultureInfo]::InvariantCulture) }
      'seek'   { $p.Position = [TimeSpan]::FromSeconds([double]::Parse($arg, [Globalization.CultureInfo]::InvariantCulture)) }
      'quit'   { $p.Close(); exit }
    }
  }
  if ($active) {
    if (-not $started -and $p.NaturalDuration.HasTimeSpan) { $started = $true; "started " + [int]$p.NaturalDuration.TimeSpan.TotalSeconds; [Console]::Out.Flush() }
    if ($started -and $p.NaturalDuration.HasTimeSpan -and $p.Position -ge $p.NaturalDuration.TimeSpan - [TimeSpan]::FromMilliseconds(300)) { $active = $false; "ended"; [Console]::Out.Flush() }
  }
  if ($active -and $started) { $tick++; if ($tick % 4 -eq 0) { "pos " + [int]$p.Position.TotalSeconds + " " + [int]$p.NaturalDuration.TimeSpan.TotalSeconds; [Console]::Out.Flush() } }
  Start-Sleep -Milliseconds 250
}
