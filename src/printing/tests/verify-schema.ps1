param([Parameter(Mandatory)][string]$RepoRoot,[Parameter(Mandatory)][string]$RunId,[Parameter(Mandatory)][string[]]$Files)
$ErrorActionPreference='Stop'
. (Join-Path $RepoRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$printingSchemaDir=Join-Path $env:PROJECT_REVIEW_RUN 'work/deps/lib3mf-src/Tests/TestFiles/Schema'
$printingSet=[System.Xml.Schema.XmlSchemaSet]::new()
$printingSet.XmlResolver=$null
$null=$printingSet.Add('http://www.w3.org/XML/1998/namespace',(Join-Path $env:PROJECT_REVIEW_RUN 'inputs/xml.xsd'))
$null=$printingSet.Add('http://schemas.microsoft.com/3dmanufacturing/core/2015/02',(Join-Path $printingSchemaDir 'core_2015_02.xsd'))
$printingSet.Compile()
$printingRecords=@()
foreach($printingFile in $Files){
 $printingZip=[IO.Compression.ZipFile]::OpenRead($printingFile)
 try{
  foreach($printingEntry in $printingZip.Entries){
   if(-not $printingEntry.FullName.EndsWith('.model')){continue}
   if($printingEntry.Length -gt 67108864){throw 'XML entry bound'}
   $printingSettings=[Xml.XmlReaderSettings]::new()
   $printingSettings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
   $printingSettings.XmlResolver=$null
   $printingSettings.MaxCharactersInDocument=67108864
   $printingSettings.ValidationType=[Xml.ValidationType]::Schema
   $printingSettings.Schemas=$printingSet
   $printingStream=$printingEntry.Open()
   $printingReader=[Xml.XmlReader]::Create($printingStream,$printingSettings)
   try{while($printingReader.Read()){}}
   finally{$printingReader.Dispose();$printingStream.Dispose()}
   $printingRecords+=@{file=$printingFile;entry=$printingEntry.FullName;schema='core_2015_02.xsd';verdict='pass';validator='.NET System.Xml '+[Environment]::Version.ToString();schemaSha256=(Get-FileHash -LiteralPath (Join-Path $printingSchemaDir 'core_2015_02.xsd')).Hash.ToLower()}
  }
 }finally{$printingZip.Dispose()}
}
$printingRecords | ConvertTo-Json -Depth 5
