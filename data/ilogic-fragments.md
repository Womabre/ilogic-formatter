# iLogic Fragments

Source of truth for the snippet pack and the completion tables. Everything under
`snippets/` and `src/generated/` is produced from this file by `npm run generate`
— edit here, never there.

## Contents

| Category | Families |
| --- | --- |
| [Excel](#excel) | [Finding rows](#finding-rows) · [Reading values](#reading-values) · [Workbook session](#workbook-session) · [Search behaviour](#search-behaviour) |
| [Variables](#variables) | [Shared variables](#shared-variables) · [Arrays and lists](#arrays-and-lists) |
| [Parameters](#parameters) | [Setting values](#setting-values) · [The parameter object](#the-parameter-object) · [Multi-value lists](#multi-value-lists) · [Rule behaviour](#rule-behaviour) |
| [Components](#components) | [Occurrence state](#occurrence-state) · [Replacing components](#replacing-components) · [Appearance](#appearance) |
| [Drawings](#drawings) | [Sheets and views](#sheets-and-views) · [Dimensions](#dimensions) · [Annotations](#annotations) · [Geometry intents](#geometry-intents) · [The model behind the drawing](#the-model-behind-the-drawing) |
| [Running other rules](#running-other-rules) | [Running rules](#running-rules) · [Arguments](#arguments) · [External code](#external-code) |

## Format

Fragments nest three headings deep. A level-2 heading is a **category** — one
area of the iLogic API. A level-3 heading is a **family** of fragments that get
used together or solve the same kind of problem. A level-4 heading is a
**fragment**: its snippet prefix in backticks, a one-line description, and a
`vb` code fence holding the body.

````markdown
## Excel

### Finding rows

#### Find a row by column value

`goexcel-findrow` — Search a worksheet for the first row matching a condition.

```vb
i = GoExcel.FindRow("${1:filename.xls}", "${2:Sheet1}", "${3:column}", "<=", ${4:0.2})
```
````

Bodies use [VS Code snippet syntax](https://code.visualstudio.com/docs/editor/userdefinedsnippets):
`${1:placeholder}` marks a tab stop, `$0` the final cursor position. Put tab
stops only on the parts a user actually changes — a snippet that stops on
every literal is slower to use than one that stops on none.

Families exist for the reader, not the generator: the snippet file is flat, so
moving a fragment between families changes nothing a user sees.

## Scope

Core iLogic only: the API available in any Inventor rule. Fragments for
add-ins that not every user has installed (iLogic Vault and similar) do not
belong here — see [`docs/adr/0002-exclude-vault-fragments.md`](../docs/adr/0002-exclude-vault-fragments.md).

---

## Excel

Reading and writing spreadsheets through the `GoExcel` wrapper. Most rules
follow the same shape: point `GoExcel` at a workbook, find the row you want,
then read columns off it.

### Finding rows

#### Find a row by column value

`goexcel-findrow` — Search a worksheet for the first row matching a column condition.

```vb
i = GoExcel.FindRow("${1:filename.xls}", "${2:Sheet1}", "${3:columnName}", "${4:<=}", ${5:0.2})
```

#### Find a row by two column values

`goexcel-findrow2` — Search a worksheet using two column conditions.

```vb
i = GoExcel.FindRow("${1:filename.xls}", "${2:Sheet1}", "${3:columnName}", "${4:<=}", ${5:0.2}, "${6:otherColumn}", "${7:<=}", ${8:4.1})
```

#### Find a row in an embedded workbook

`goexcel-findrow-embedded` — Search a workbook embedded in the document instead of an external file.

```vb
i = GoExcel.FindRow("3rd Party:Embedding ${1:1}", "${2:Sheet1}", "${3:columnName}", "${4:<=}", ${5:0.2})
```

#### Read a column from the row last found

`goexcel-currentrowvalue` — Read a cell from the row returned by the last FindRow.

```vb
${1:value} = GoExcel.CurrentRowValue("${2:columnName}")
```

### Reading values

#### Read a single cell

`goexcel-cellvalue` — Read one cell from a worksheet by address.

```vb
${1:value} = GoExcel.CellValue("${2:filename.xls}", "${3:Sheet1}", "${4:A2}")
```

#### Read a cell from an embedded workbook

`goexcel-cellvalue-embedded` — Read one cell from a workbook embedded in the document.

```vb
${1:value} = GoExcel.CellValue("3rd Party:Embedding ${2:1}", "${3:Sheet1}", "${4:A2}")
```

#### Read a range of cells

`goexcel-cellvalues` — Read a range and return it as a list.

```vb
${1:values} = GoExcel.CellValues("${2:filename.xls}", "${3:Sheet1}", "${4:A2}", "${5:A10}")
```

#### Read a named range

`goexcel-namedrangevalue` — Read a value by its defined name rather than its address.

```vb
${1:value} = GoExcel.NamedRangeValue("${2:Part_Width}")
```

### Workbook session

#### Open, edit and save a workbook

`goexcel-open-save` — Open a worksheet, work on it, then save and close.

```vb
GoExcel.Open("${1:filename.xls}", "${2:Sheet1}")
${3:' read or write cells here}
GoExcel.Save
GoExcel.Close
$0
```

#### Repoint a linked workbook

`goexcel-changesource` — Redirect a linked spreadsheet to a different file.

```vb
changeOK = GoExcel.ChangeSourceOfLinked("${1:partialOldName}", "${2:newName}")
```

#### Reach the Excel application object

`goexcel-application` — Get the underlying Excel Application for anything the iLogic wrapper does not cover.

```vb
excelApp = GoExcel.Application
```

### Search behaviour

#### Configure the search behaviour

`goexcel-options` — Set the header row, the first data row, the match tolerance and alerts.

```vb
GoExcel.TitleRow = ${1:1}
GoExcel.FindRowStart = ${2:2}
GoExcel.Tolerance = ${3:0.0000001}
GoExcel.DisplayAlerts = ${4:False}
$0
```

---

## Variables

Carrying values between rules, and the collection types rules use most.

### Shared variables

#### Read or write a shared variable

`sharedvariable` — Share a value between rules in the same document session.

```vb
SharedVariable("${1:VariableName}") = ${2:value}
```

#### Guard on a shared variable

`sharedvariable-exists` — Only read a shared variable once it has been set.

```vb
If SharedVariable.Exists("${1:VariableName}") Then
	${2:value} = SharedVariable("${1:VariableName}")
End If
$0
```

#### Remove shared variables

`sharedvariable-remove` — Drop one shared variable, or clear all of them.

```vb
SharedVariable.Remove("${1:VariableName}")
```

### Arrays and lists

#### Declare a typed array

`array-new` — Declare and initialise an array in one statement.

```vb
Dim ${1:values} = New ${2|Double,Integer,String|}(){${3:1.2, 2.2, 3.3}}
```

#### Build an ArrayList

`arraylist` — Collect values of mixed types.

```vb
Dim ${1:myList} As New ArrayList
${1:myList}.Add(${2:"Hello World"})
$0
```

#### Loop over a collection

`foreach` — Visit every item in a list or collection.

```vb
For Each ${1:item} In ${2:collection}
	${3:MessageBox.Show(${1:item})}
Next
$0
```

---

## Parameters

Driving the model. `Parameter(...)` reads and writes values; `Parameter.Param(...)`
reaches the parameter itself, for tolerances and comments; `MultiValue` controls
the list of values a parameter is allowed to take.

### Setting values

#### Set a parameter

`param-set` — Write a value to a model parameter.

```vb
Parameter("${1:d0}") = ${2:1.2}
```

#### Set a parameter in a component

`param-set-component` — Write a parameter of a part or subassembly from the assembly.

```vb
Parameter("${1:Part1:1}", "${2:d0}") = ${3:1.2}
```

#### Set a parameter deeper in the tree

`param-set-path` — Address a component through its occurrence path.

```vb
Parameter(MakePath("${1:SubAssem1:1}", "${2:Part1:1}"), "${3:d0}") = ${4:1.2}
```

#### Read a parameter as its equation

`param-valueforequals` — Read the expression a parameter is driven by, not its evaluated number.

```vb
${1:expression} = Parameter.ValueForEquals("${2:d0}")
```

### The parameter object

#### Get the parameter object

`param-object` — Reach a parameter's own properties rather than its value.

```vb
Dim ${1:p} = Parameter.Param("${2:d0}")
```

#### Set a deviation tolerance

`param-tolerance-deviation` — Apply an asymmetric tolerance to a parameter.

```vb
Parameter.Param("${1:d0}").Tolerance.SetToDeviation(${2:0.002} * 2.54, ${3:-0.004} * 2.54)
```

#### Set a symmetric tolerance

`param-tolerance-symmetric` — Apply a plus/minus tolerance to a parameter.

```vb
Parameter.Param("${1:d0}").Tolerance.SetToSymmetric(${2:0.005} * 2.54)
```

#### Comment a parameter

`param-comment` — Write the comment shown next to a parameter in the parameters dialog.

```vb
Parameter.Param("${1:d1}").Comment = "${2:Comment set by a rule}"
```

### Multi-value lists

#### Set a multi-value list

`multivalue-setlist` — Give a parameter a fixed list of allowed values.

```vb
MultiValue.SetList("${1:d0}", ${2:0.5, 0.75, 1.0, 1.25})
```

#### Set a multi-value list in a component

`multivalue-setlist-component` — Give a component's parameter a list of allowed values.

```vb
MultiValue.SetListInComponent("${1:Part1:1}", "${2:d0}", ${3:0.5, 0.75, 1.0, 1.25})
```

#### Read a multi-value list

`multivalue-list` — Read the allowed values of a parameter.

```vb
${1:values} = MultiValue.List("${2:d0}")
```

#### Fill a multi-value list from Excel

`multivalue-from-excel` — Drive a parameter's allowed values from a spreadsheet range.

```vb
MultiValue.List("${1:d0}") = GoExcel.CellValues("${2:filename.xls}", "${3:Sheet1}", "${4:A2}", "${5:A10}")
```

#### Find a value in a multi-value list

`multivalue-findvalue` — Pick the list entry matching a condition.

```vb
foundVal = MultiValue.FindValue(MultiValue.List("${1:d0}"), "${2:<=}", ${3:4.0})
```

#### Control the multi-value prompt

`multivalue-setvalueoptions` — Decide whether changing a list prompts the user, and which entry is preselected.

```vb
MultiValue.SetValueOptions(${1:True}, DefaultIndex := ${2:0})
```

#### Pick a value by index

`choose` — Select one of several values by position.

```vb
${1:result} = Choose(${2:index}, "${3:first}", "${4:second}", "${5:third}")
```

### Rule behaviour

#### Suppress parameter dialogs and updates

`param-quiet` — Stop parameter changes from prompting or triggering an update mid-rule.

```vb
Parameter.Quiet = True
Parameter.UpdateAfterChange = ${1:False}
$0
```

#### Load or save parameters as XML

`param-xml` — Move a document's parameters to or from an XML file.

```vb
iLogicVb.Automation.ParametersXmlSave(ThisDoc.Document, "${1:path\filename.xml}")
```

---

## Components

Working with occurrences in an assembly. An occurrence is named `Part1:1`;
anything nested deeper is addressed through `MakePath`.

### Occurrence state

#### Test whether a component is active

`component-isactive` — Branch on a component's suppression state.

```vb
If Component.IsActive("${1:Part1:1}") Then
	$0
End If
```

#### Test a component deeper in the tree

`component-isactive-path` — Address a component through its occurrence path.

```vb
If Component.IsActive(MakePath("${1:SubAssem1:1}", "${2:Part2:1}")) Then
	$0
End If
```

#### Read or set the active model state

`component-modelstate` — Switch a component to a different model state.

```vb
Component.ActiveModelState("${1:Part1:1}") = "${2:ModelState1}"
```

#### Skip the document save prompt

`component-skipsave` — Stop component changes from marking documents dirty.

```vb
Component.SkipDocumentSave = True
```

### Replacing components

#### Replace a component

`component-replace` — Swap a component for a different file.

```vb
Component.Replace("${1:Part1:1}", "${2:OtherPart.ipt}", ${3:True})
```

#### Replace a component with a model state

`component-replace-modelstate` — Swap a component and select a model state in the new file.

```vb
Component.Replace("${1:SubAssembly:1}", "${2:OtherAssembly.iam}<${3:Model State1}>", ${4:True})
```

#### Replace an iPart member

`component-replaceipart` — Switch an iPart occurrence to a different table row.

```vb
Component.ReplaceiPart("${1:iPart1:1}", "${2:OtherPart.ipt}", ${3:True}, ${4:rowNumber})
```

### Appearance

#### Set component colour

`component-color` — Override the appearance of one occurrence.

```vb
Component.Color("${1:Part1:1}") = "${2:Red}"
```

#### Show or hide a component

`component-visible` — Set an occurrence's visibility.

```vb
Component.Visible("${1:Part1:1}") = ${2:False}
```

---

## Drawings

Annotating drawings from a rule. Almost every drawing fragment starts by
naming a sheet and a view, then addresses model geometry through an *intent* —
a named handle onto a face, edge or point that survives model changes.

### Sheets and views

#### Wrap drawing edits in a manage block

`thisdrawing-manage` — Group drawing changes so Inventor updates once at the end.

```vb
ThisDrawing.BeginManage()
${1:' add dimensions, annotations, etc. here}
ThisDrawing.EndManage()
$0
```

#### Get a sheet and a view

`thisdrawing-sheet-view` — The two lookups most drawing fragments start with.

```vb
Dim ${1:sheet} = ThisDrawing.Sheets.ItemByName("${2:Sheet:1}")
Dim ${3:view} = ${1:sheet}.DrawingViews.ItemByName("${4:VIEW1}")
$0
```

#### Suppress a view

`thisdrawing-suppress-view` — Suppress or unsuppress a drawing view.

```vb
ActiveSheet.View("${1:VIEW2}").View.Suppressed = ${2:True}
```

#### Hide a layer

`thisdrawing-layer-visible` — Turn a drawing layer off.

```vb
ThisDrawing.Document.StylesManager.Layers("${1:Dimension (ANSI)}").Visible = ${2:False}
```

### Dimensions

#### Add a linear dimension

`thisdrawing-dim-linear` — Dimension a named piece of geometry on a view.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim geometry = view.GetIntent("${3:NamedGeometry1}")
Dim genDims = sheet.DrawingDimensions.GeneralDimensions
Dim ${4:linDim} = genDims.AddLinear("${5:Dimension 1}", view.SheetPoint(${6:0.5}, ${7:-0.1}), geometry)
$0
```

#### Add an angular dimension

`thisdrawing-dim-angular` — Dimension the angle between two named edges.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim genDims = sheet.DrawingDimensions.GeneralDimensions
Dim ${3:angDim} = genDims.AddAngular("${4:Angular Dim 1}", _
	ThisDrawing.Geometry.Point2d(${5:80}, ${6:100}), _
	view.GetIntent("${7:Angle Side1}"), view.GetIntent("${8:Angle Side2}"))
$0
```

#### Add a radius dimension

`thisdrawing-dim-radius` — Dimension a fillet or arc.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim genDims = sheet.DrawingDimensions.GeneralDimensions
Dim ${3:radDim} = genDims.AddRadius("${4:Fillet Radius}", view.SheetPoint(${5:1.1}, ${6:-0.1}), view.GetIntent("${7:FilletFace}"))
$0
```

#### Add a diameter dimension

`thisdrawing-dim-diameter` — Dimension a hole or cylindrical face.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim genDims = sheet.DrawingDimensions.GeneralDimensions
Dim ${3:diaDim} = genDims.AddDiameter("${4:Hole Diameter}", view.SheetPoint(${5:0.25}, ${6:0.45}), view.GetIntent("${7:HoleFace}"))
$0
```

### Annotations

#### Add a centermark to a hole

`thisdrawing-centermark` — Mark the centre of a hole edge.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim holeIntent = view.GetIntent("${3:HoleEdge}", PointIntentEnum.kCenterPointIntent)
Dim ${4:centermark} = sheet.Centermarks.Add("${5:Hole Centermark}", holeIntent)
$0
```

#### Add a centerline through a pattern

`thisdrawing-centerline-pattern` — Draw the centred pattern centreline.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim ${3:centerlinePattern} = sheet.Centerlines.AddCenteredPattern("${4:Centerline Pattern}", view.GetIntent("${5:PatternCenter}"), {view.GetIntent("${6:Pattern1}"), view.GetIntent("${7:Pattern2}")})
$0
```

#### Add a leader note

`thisdrawing-leadernote` — Attach a note to a face with a leader line.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim leaderNotes = sheet.DrawingNotes.LeaderNotes
Dim ${3:leaderNote} = leaderNotes.Add("${4:Note 1}", _
	ThisDrawing.Geometry.Point2dList({{${5:150}, ${6:100}}, {${7:160}, ${8:100}}}), _
	view.GetIntent("${9:Face1}"), "${10:NOTE TEXT}")
$0
```

#### Add a hole or thread note

`thisdrawing-holenote` — Annotate a hole with its thread callout.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim holeThreadNotes = sheet.DrawingNotes.HoleThreadNotes
Dim holeFace = view.GetIntent("${3:ComponentA1:1}", "${4:Hole1 Cylindrical Face}")
Dim ${5:holeNote} = holeThreadNotes.Add("${6:Hole Note 1}", view.SheetPoint(${7:0.8}, ${8:0.5}), holeFace)
$0
```

#### Add a balloon

`thisdrawing-balloon` — Balloon a component in a view.

```vb
Dim sheet = ThisDrawing.Sheets.ItemByName("${1:Sheet:1}")
Dim view = sheet.DrawingViews.ItemByName("${2:VIEW1}")
Dim pt = view.SheetPoint(${3:-0.1}, ${4:0.1})
Dim ${5:balloon} = sheet.Balloons.Add("${6:ComponentA:1 balloon}", {pt}, view.GetIntent("${7:ComponentA:1}", "${8:CylinderFace}"))
$0
```

### Geometry intents

#### Get a geometry intent

`thisdrawing-getintent` — Address model geometry from a drawing view.

```vb
Dim ${1:intent} = ${2:view}.GetIntent("${3:ComponentA:1}", "${4:Face1}")
```

#### Get a feature face intent

`thisdrawing-featurefaceintent` — Address a specific face of a named feature.

```vb
Dim ${1:intent} = ${2:view}.GetFeatureFaceIntent("${3:Hole1}", HoleFaceIdentifierEnum.${4:MainCylinder})
```

#### Get a patterned face intent

`thisdrawing-patternfaceintent` — Address one occurrence within a feature pattern.

```vb
Dim ${1:intent} = ${2:view}.GetPatternFaceIntent("${3:ComponentA:1}", "${4:Hole Pattern1}", {${5:3}, ${6:2}}, ${7:1})
```

### The model behind the drawing

#### Get the model behind the drawing

`thisdrawing-modeldocument` — Reach the part or assembly the drawing documents.

```vb
Dim ${1:modelDoc} = ThisDrawing.ModelDocument
```

#### Get the model behind one view

`thisdrawing-view-modeldocument` — Reach the model a specific view shows.

```vb
Dim ${1:viewModelDoc} = ActiveSheet.View("${2:VIEW1}").ModelDocument
```

#### Read a model parameter from a drawing

`thisdrawing-model-parameter` — Read a parameter of the model the drawing documents.

```vb
Dim modelName = IO.Path.GetFileName(ThisDrawing.ModelDocument.FullFileName)
Dim ${1:dwgParam} = Parameter(modelName, "${2:d0}")
$0
```

---

## Running other rules

Rules calling other rules, and the plumbing for passing values between them.

### Running rules

#### Run a rule in this document

`ilogicvb-runrule` — Run another rule by name.

```vb
iLogicVb.RunRule("${1:ruleName}")
```

#### Run a rule in a component

`ilogicvb-runrule-component` — Run a rule that lives in a component's document.

```vb
iLogicVb.RunRule("${1:Part1:1}", "${2:ruleName}")
```

#### Run an external rule

`ilogicvb-runexternalrule` — Run a rule stored outside the document.

```vb
iLogicVb.RunExternalRule("${1:ruleFileName}")
```

#### Force a document update

`documentupdate` — Rebuild the document after changing it.

```vb
InventorVb.DocumentUpdate()
```

### Arguments

#### Run a rule with arguments

`ilogicvb-runrule-args` — Pass values into the rule being run.

```vb
Dim map As Inventor.NameValueMap = ThisApplication.TransientObjects.CreateNameValueMap()
map.Add("${1:Arg1}", ${2:"Arg1Value"})
iLogicVb.RunRule("${3:ruleName}", map)
$0
```

#### Read a rule argument

`rulearguments` — Read a value passed in by the rule that started this one.

```vb
${1:arg1Value} = RuleArguments("${2:Arg1}")
```

### External code

#### Run a VBA macro

`inventorvb-runmacro` — Call into VBA from an iLogic rule.

```vb
InventorVb.RunMacro("${1:projectName}", "${2:moduleName}", "${3:macroName}")
```

#### Reference another rule or file

`addvbrule` — Make another rule, file or resource available to this one.

```vb
AddVbRule "${1:RuleName}"
```
