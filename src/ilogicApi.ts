// The predefined iLogic objects available in every rule, and their members.
// Source: Autodesk iLogic API reference, namespace Autodesk.iLogic.Interfaces
// (help.autodesk.com/cloudhelp/2021/ENU/Inventor-iLogic-API), read 2026-10-03.
// Summaries are short paraphrases; each object links to its reference page.

export interface ApiMember {
    name: string;
    kind: "property" | "method";
    summary: string;
    /** Parameter lists of the overloads, where the reference shows them */
    signatures?: string[];
}

export interface ApiObject {
    /** The name used in rules, e.g. "ThisDoc" */
    name: string;
    /** The interface behind it, e.g. "ICadDoc" */
    type: string;
    summary: string;
    /** Page name under the reference's files/html/ folder */
    page?: string;
    members: ApiMember[];
}

export const REFERENCE_BASE = "https://help.autodesk.com/cloudhelp/2021/ENU/Inventor-iLogic-API/files/html/";

const p = (name: string, summary: string, signatures?: string[]): ApiMember => ({ name, kind: "property", summary, signatures });
const m = (name: string, summary: string, signatures?: string[]): ApiMember => ({ name, kind: "method", summary, signatures });

export const ILOGIC_OBJECTS: ApiObject[] = [
    {
        name: "ThisApplication", type: "Inventor.Application",
        summary: "The Inventor Application object. Not available in Design Automation; fall back to ThisServer.",
        members: [],
    },
    {
        name: "ThisServer", type: "Inventor.Application",
        summary: "The Inventor (Server) Application object; the fallback where ThisApplication is not available.",
        members: [],
    },
    {
        name: "ThisDoc", type: "ICadDoc", page: "40e8d82c-2ef4-1a94-b16c-bd7f0510ab50.htm",
        summary: "The document the rule is running in.",
        members: [
            p("Document", "The document the rule is running in."),
            p("FileName", "File name of the document the rule is running in."),
            p("Geometry", "Creates points, vectors and matrices in document units."),
            p("ModelDocument", "The document shown in the first model view, or Nothing."),
            p("NamedEntities", "Named entities and work features in the document."),
            p("Path", "Folder that holds the document."),
            p("PathAndFileName", "Full path and file name of the document, optionally with extension.", ["(Optional withExtension As Boolean = False)"]),
            p("WorkspacePath", "Workspace folder of the active project; empty if not defined."),
            m("ChangeExtension", "File name with the same name and a different extension."),
            m("Launch", "Launches a file or executable; Inventor files open in this session."),
            m("Save", "Saves the document the rule is running in."),
        ],
    },
    {
        name: "iProperties", type: "IiProperties", page: "00d7f758-ed82-379f-c561-ea963c831905.htm",
        summary: "Gets and sets iProperty values and physical properties.",
        members: [
            p("Value", "Gets or sets an iProperty value (String, Double, Date or Boolean).", ["(setName As String, propertyName As String)", "(componentOrDocName As Object, setName As String, propertyName As String)"]),
            p("Expression", "Gets or sets an iProperty expression as text.", ["(String, String)", "(Object, String, String)"]),
            p("Area", "Total surface area of the part or assembly, or of a component.", ["()", "(Object)"]),
            p("CenterOfGravity", "Center of mass of the part or assembly, or of a component.", ["()", "(Object)"]),
            p("Mass", "Gets or overrides the mass of the part or assembly, or of a component.", ["()", "(Object)"]),
            p("Material", "Gets or sets the part material (parts only).", ["()", "(Object)"]),
            p("Materials", "Names of the materials available in the document."),
            p("PartColor", "Gets or sets the appearance of the current part."),
            p("StylesInEnglish", "Return material and appearance names in English."),
            p("Volume", "Gets or overrides the volume of the part or assembly, or of a component.", ["()", "(Object)"]),
        ],
    },
    {
        name: "Parameter", type: "IParamDynamic", page: "7001c866-df68-e660-bbea-fbe6a2c5f9e5.htm",
        summary: "Gets and sets parameter values, e.g. Parameter(\"d0\").",
        members: [
            p("Value", "Gets or sets a parameter value in document units.", ["(String)", "(Object, String)"]),
            p("ValueForEquals", "Gets or sets a numeric value compared with a tolerance (DoubleForEquals).", ["(String)", "(Object, String)"]),
            p("Param", "The Inventor.Parameter object for a parameter name.", ["(String)", "(Object, String)"]),
            p("Quiet", "When True, a missing parameter does not throw an error."),
            p("UpdateAfterChange", "When True, the document updates after a parameter change."),
        ],
    },
    {
        name: "Logger", type: "IRuleLogger", page: "5f5c9f2b-e3ab-9430-c85d-4deb9587474b.htm",
        summary: "Writes messages to the iLogic Log window. Use instead of MsgBox for diagnostics.",
        members: [
            m("Trace", "Logs a message at Trace level (step-by-step flow)."),
            m("Debug", "Logs a message at Debug level (values and decisions)."),
            m("Info", "Logs a message at Info level (normal milestones)."),
            m("Warn", "Logs a message at Warn level (unexpected but recoverable)."),
            m("Error", "Logs a message at Error level (an operation failed)."),
            m("Fatal", "Logs a message at Fatal level (the rule cannot continue)."),
        ],
    },
    {
        name: "SharedVariable", type: "ISharedVariable", page: "9da80dee-a3ae-2f47-324b-4ef496b40e5b.htm",
        summary: "Temporary variables shared between rules for the current session.",
        members: [
            p("Value", "Gets or sets a shared variable; creates it if it does not exist."),
            m("Exists", "Whether a shared variable with this name exists."),
            m("Remove", "Removes a shared variable."),
            m("RemoveAll", "Removes all shared variables."),
        ],
    },
    {
        name: "MultiValue", type: "IMultiValueParam", page: "f4089b5f-8cb8-ed6c-9527-566a844d3dff.htm",
        summary: "Lists of allowed values for multi-value parameters.",
        members: [
            p("List", "Gets or sets the list of possible values for a parameter.", ["(String)", "(Object, String)"]),
            p("Quiet", "When True, a missing parameter does not throw an error."),
            p("UpdateAfterChange", "When True, the document updates after a value change."),
            m("FindValue", "Looks for a value in a list."),
            m("SetList", "Sets the list of possible values for a parameter."),
            m("SetValueOptions", "Sets what happens to the value when the list changes."),
        ],
    },
    {
        name: "iLogicVb", type: "ILowLevelSupport", page: "05d9c5e8-452e-3474-8a81-2006b7aa69ac.htm",
        summary: "Runs rules and macros, updates the document, and gives low-level access.",
        members: [
            p("Application", "The Inventor Application object."),
            p("Automation", "The iLogic Automation object (iLogic API functions)."),
            p("InventorServer", "The Inventor Server object."),
            p("RuleDocument", "The document the rule is being run from."),
            p("RuleName", "Name of the current rule."),
            p("UpdateWhenDone", "Update the document after the rule finishes."),
            m("CreateObjectProvider", "Creates a factory for the standard objects of another document."),
            m("DocumentUpdate", "Updates the document the rule is running in.", ["()", "(Boolean)"]),
            m("RunExternalRule", "Runs an external rule by name.", ["(String)", "(String, NameValueMap)"]),
            m("RunMacro", "Runs a VBA macro."),
            m("RunRule", "Runs a rule in this or another document.", ["(String)", "(Object, String)", "(String, NameValueMap)", "(Object, String, NameValueMap)"]),
            m("SetViewCamera", "Sets the camera direction, orientation and scale of the view."),
        ],
    },
    {
        name: "Feature", type: "ICadFeature", page: "3fdaeb47-2348-3c3c-cb54-910590eea911.htm",
        summary: "Feature suppression, appearance and threads.",
        members: [
            p("IsActive", "Whether a feature is active (not suppressed).", ["(String)", "(Object, String)"]),
            p("Color", "Gets or sets the appearance of a feature.", ["(String)", "(Object, String)"]),
            p("InventorFeature", "The Inventor feature object by name; throws if not found.", ["(String)", "(Object, String)"]),
            p("ThreadClass", "Gets or sets the thread class of a threaded feature."),
            p("ThreadDesignation", "Gets or sets the thread designation of a threaded feature."),
            p("ThreadType", "The thread type of a threaded feature; change it with SetThread."),
            m("SetThread", "Sets thread type, designation and class of a feature.", ["(String, String, String, String)", "(Object, String, String, String, String)"]),
        ],
    },
    {
        name: "Component", type: "ICadComponent", page: "a7af8e53-7944-ff0c-62ce-b023a2434819.htm",
        summary: "Component occurrences in an assembly: suppression, visibility, appearance, replace.",
        members: [
            p("IsActive", "Whether a component occurrence is active (not suppressed)."),
            p("Visible", "Gets or sets the visibility of a component occurrence."),
            p("Color", "Gets or sets the appearance of a component."),
            p("iComponentIsActive", "Whether an iPart or iAssembly component is active."),
            p("InventorComponent", "Finds a component by name in the assembly or its subassemblies."),
            p("InventorComponentInThisContext", "Finds a component by name, as an occurrence in this assembly's context."),
            p("SkipDocumentSave", "(No description in the reference.)"),
            m("Replace", "Replaces a component occurrence with another document."),
            m("ReplaceiPart", "Replaces an iPart occurrence, possibly from another factory."),
        ],
    },
    {
        name: "GoExcel", type: "IGoExcel", page: "af87c7b4-cf59-8cce-c207-cbd8a3b6632e.htm",
        summary: "Reads and writes Excel workbooks.",
        members: [
            p("CellValue", "Gets or sets a cell value.", ["(String)", "(String, String, String)"]),
            p("CellValues", "Gets or sets values of a single row or column.", ["(String, String)", "(String, String, String, String)"]),
            p("NamedRangeValue", "Gets or sets the value of a named range."),
            p("TitleRow", "1-based row holding the column names."),
            p("FindRowStart", "1-based first row searched by FindRow."),
            p("Tolerance", "Numeric tolerance for FindRow comparisons."),
            p("DisplayAlerts", "Whether Excel alert dialogs are shown."),
            p("Application", "The Excel Application object."),
            m("Open", "Opens a workbook, optionally on a given sheet."),
            m("Close", "Closes the open Excel file."),
            m("Save", "Saves the open Excel file."),
            m("FindRow", "Finds and selects the row that matches the given values."),
            m("FindColumn", "Finds a column by its name in the title row.", ["(String)", "(String, Integer)"]),
            m("CurrentRowValue", "Value at a column in the current row."),
            m("ChangeSourceOfLinked", "Replaces the linked Excel file with another file."),
            m("ClearCache", "Clears the cache used by FindRow and CurrentRowValue."),
            m("QuitApplication", "Quits the Excel application used by GoExcel."),
        ],
    },
    {
        name: "RuleArguments", type: "IRuleArguments", page: "c6f2c020-8318-5536-3e1f-c57a5125071b.htm",
        summary: "Arguments passed to this rule by RunRule or RunExternalRule.",
        members: [
            p("Arguments", "The complete list of arguments."),
            p("Value", "The value of a rule argument."),
            m("Exists", "Whether an argument was passed to this rule."),
        ],
    },
    {
        name: "Measure", type: "ICadMeasure", page: "ba9237a1-a589-5a30-8e2e-912f5fc4a78d.htm",
        summary: "Distances, angles, extents, and sketch area and perimeter.",
        members: [
            p("ExtentsLength", "Extents along the X axis of the bounding box."),
            p("ExtentsWidth", "Extents along the Y axis of the bounding box."),
            p("ExtentsHeight", "Extents along the Z axis of the bounding box."),
            m("MinimumDistance", "Shortest distance between two entities.", ["(Object, Object)", "(Object, Object, Object, Object)"]),
            m("Angle", "Angle between entities, or between three points.", ["(Object, Object, Object)", "(Object, Object, Object, Object, Object, Object)"]),
            m("Area", "Total area of a sketch."),
            m("Perimeter", "Total perimeter of a sketch."),
        ],
    },
    {
        name: "ThisBom", type: "ICadBom", page: "eb2a3e31-d535-d5f2-bff2-ab56bec56520.htm",
        summary: "The bill of materials of this assembly.",
        members: [
            m("OverrideQuantity", "Sets a custom quantity for a BOM item."),
            m("CalculateQuantity", "Resets a BOM quantity to the calculated value."),
            m("Export", "Exports a BOM view."),
        ],
    },
    {
        name: "SheetMetal", type: "ISheetMetal", page: "f24ebce0-53dc-176a-f7c4-ee47d546edff.htm",
        summary: "Sheet metal style and flat pattern extents.",
        members: [
            p("FlatExtentsLength", "Flat pattern length along X; creates the flat pattern if needed."),
            p("FlatExtentsWidth", "Flat pattern width along Y; creates the flat pattern if needed."),
            p("FlatExtentsArea", "Flat pattern area; creates the flat pattern if needed."),
            p("ActiveKFactor", "The active K-factor (linear unfolding methods only)."),
            m("GetActiveStyle", "Name of the active sheet metal style."),
            m("SetActiveStyle", "Sets the active sheet metal rule."),
        ],
    },
    {
        name: "ThisAssembly", type: "IManagedAssembly", page: "9dbaab78-ec2c-007b-486f-0edd27aeb720.htm",
        summary: "Adds, changes and deletes components, constraints and patterns in this assembly.",
        members: [
            p("Components", "Add, modify and delete components."),
            p("Constraints", "Add, modify and delete constraints."),
            p("Patterns", "Add, modify and delete component patterns."),
            p("Document", "The assembly document managed by the rule."),
            p("Geometry", "Creates points, vectors and matrices in assembly units."),
            p("ImmediateConstraints", "Controls deferred assembly updates after constraint changes."),
            m("BeginManage", "Starts a managed group; untouched items are deleted at EndManage."),
            m("EndManage", "Ends a managed group and deletes untouched items."),
            m("GetAppearanceAsset", "An appearance asset from the document or a library.", ["(String)", "(String, String)"]),
        ],
    },
    {
        name: "ThisDrawing", type: "ICadDrawing / IManagedDrawing", page: "f22a0d38-c6e2-326c-3835-e5eb4e424350.htm",
        summary: "The drawing the rule runs in: sheets, resources and managed entities.",
        members: [
            p("ActiveSheet", "The active sheet."),
            p("Sheet", "A sheet by name; throws if not found."),
            p("Sheets", "The managed sheets."),
            p("Document", "The drawing document the rule runs in."),
            p("ModelDocument", "The document shown in the first view, or Nothing."),
            p("Geometry", "Creates points, vectors and matrices in document units."),
            p("ResourceFileName", "Drawing to copy title blocks and borders from."),
            p("KeepExtraResources", "Keep resources copied for replacements."),
            p("Name", "Name of the managed item."),
            p("NativeEntity", "The underlying Inventor API object."),
            m("BeginManage", "Starts a managed group; untouched items are deleted at EndManage."),
            m("EndManage", "Ends a managed group and deletes untouched items."),
            m("AddManagedEntity", "Registers or creates a generic managed entity."),
            m("DeleteManagedEntity", "Removes a generic managed entity."),
        ],
    },
    {
        name: "Components", type: "IManagedComponents", page: "d1565542-60a6-9e90-a8a7-117b4b469936.htm",
        summary: "Adds, changes and deletes component occurrences in this assembly.",
        members: [
            p("Item", "A component occurrence by name."),
            p("Count", "Number of component occurrences."),
            p("ContentCenterLanguage", "Language used for Content Center searches."),
            p("TableSearchTolerance", "Numeric tolerance for iPart table searches."),
            m("Add", "Adds or modifies a component occurrence."),
            m("AddiPart", "Adds or modifies an iPart, by row index or by column values."),
            m("AddContentCenterPart", "Adds a Content Center part, by family path or by designation."),
            m("Delete", "Deletes a component occurrence."),
        ],
    },
    {
        name: "Constraints", type: "IManagedConstraints", page: "6f83a7ef-b970-caae-9e95-ffef394d4488.htm",
        summary: "Adds, changes and deletes assembly constraints.",
        members: [
            m("AddMate", "Adds or modifies a mate constraint."),
            m("AddFlush", "Adds or modifies a flush constraint."),
            m("AddAngle", "Adds or modifies an angle constraint."),
            m("AddInsert", "Adds or modifies an insert constraint."),
            m("AddTangent", "Adds or modifies a tangent constraint."),
            m("AddSymmetry", "Adds or modifies a symmetry constraint."),
            m("AddRotate", "Adds or modifies a rotate-rotate or rotate-translate constraint."),
            m("AddTransitional", "Adds or modifies a transitional constraint."),
            m("AddUcsToUcs", "Adds or modifies three flush constraints between UCSs."),
            m("AddByiMates", "Adds or modifies a constraint between iMates."),
            m("AddByiMateAndEntity", "Adds or modifies a constraint between an iMate and an entity."),
            m("Delete", "Deletes a constraint; no error if it does not exist."),
        ],
    },
    {
        name: "Patterns", type: "IManagedPatterns", page: "474faa47-7dac-e756-490e-f328f961ed4a.htm",
        summary: "Adds, changes and deletes component patterns.",
        members: [
            p("Item", "An occurrence pattern by name."),
            m("AddRectangular", "Creates or updates a rectangular pattern."),
            m("AddCircular", "Creates or updates a circular pattern."),
            m("AddFeatureBased", "Creates or updates a feature-based pattern."),
            m("Delete", "Deletes an occurrence pattern."),
        ],
    },
    {
        name: "Constraint", type: "IAssemConstraint", page: "0fa5a225-e3e1-c1e6-ff60-3cfa2c46ba19.htm",
        summary: "Suppression of assembly constraints and iMates.",
        members: [
            p("IsActive", "Whether a constraint is active (not suppressed).", ["(String)", "(Object, String)"]),
            p("iMateDefIsActive", "Whether an iMate definition is active.", ["(String)", "(Object, String)"]),
        ],
    },
    {
        name: "Joint", type: "IAssemJoint", page: "5777062e-ffb9-6392-f0ca-99292a52f855.htm",
        summary: "Suppression of assembly joints.",
        members: [
            p("IsActive", "Whether a joint is active (not suppressed).", ["(String)", "(Object, String)"]),
        ],
    },
    {
        name: "iFeature", type: "IiFeatureRowChanger", page: "9dbf4ac4-aff5-979f-8208-0cf8a2ff0ffc.htm",
        summary: "Table rows of iFeatures and sheet metal punch tools.",
        members: [
            p("Tolerance", "Numeric tolerance for FindRow comparisons."),
            m("ChangeRow", "Activates a row."),
            m("FindRow", "Finds and activates the row that matches the criteria."),
            m("CurrentRowValue", "Numeric value at a column in the current row."),
            m("CurrentRowStringValue", "Text value at a column in the current row."),
        ],
    },
    ...["iPart", "iAssembly"].map((name): ApiObject => ({
        name, type: "IiPartRowChanger", page: "bfbf0f28-59dd-25b8-fc9f-e48915b2ba86.htm",
        summary: `Table rows of ${name} factories.`,
        members: [
            p("Tolerance", "Numeric tolerance for FindRow comparisons."),
            m("ChangeRow", "Activates a row of the table."),
            m("FindRow", "Finds and activates the row that matches the criteria."),
            m("CurrentRowValue", "Numeric value at a column in the active row."),
            m("CurrentRowStringValue", "Text value at a column in the active row."),
            m("RowName", "Member name of the current row."),
            m("RowNumber", "1-based number of the current row."),
        ],
    })),
    {
        name: "iLogicForm", type: "IiLogicForm", page: "8c1bfda5-c37c-0bfa-a7ad-e4933efa2bfa.htm",
        summary: "Shows iLogic forms stored in the model or globally.",
        members: [
            m("Show", "Shows a form stored in the model."),
            m("ShowGlobal", "Shows a global form."),
            p("FormNames", "Names of the forms stored in the model."),
            p("GlobalFormNames", "Names of the global forms."),
            p("EnablePositionAndSizeSaving", "Save form size and position when the form closes."),
        ],
    },
    {
        name: "Sketch", type: "ICadSketch", page: "ceb60079-f8c2-8d1a-9316-3bebb432776d.htm",
        summary: "Redefines sketches.",
        members: [m("Redefine", "Redefines a sketch; best for self-contained sketches without projected geometry.")],
    },
    {
        name: "WorkPlane", type: "ICadWorkPlane", page: "4c0fcba1-6986-ca53-d3f0-3547c3356506.htm",
        summary: "Work plane orientation.",
        members: [m("FlipNormal", "Reverses the work plane normal if it does not point along an axis.")],
    },
];

/** InventorVb is the older name for iLogicVb */
ILOGIC_OBJECTS.push({ ...ILOGIC_OBJECTS.find((o) => o.name === "iLogicVb")!, name: "InventorVb" });

/** Looks up a predefined object by name (VB is case-insensitive). */
export function findObject(name: string): ApiObject | undefined {
    const lower = name.toLowerCase();
    return ILOGIC_OBJECTS.find((o) => o.name.toLowerCase() === lower);
}
