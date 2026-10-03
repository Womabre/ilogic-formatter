// VB.NET / iLogic keywords: the single source for keyword casing (formatter)
// and keyword highlighting (scripts/build-grammar.ts writes the TextMate
// grammar from KEYWORD_GROUPS; test/grammar.test.ts fails if it is stale).
//
// Covers every reserved keyword in the VB language reference
// (learn.microsoft.com/dotnet/visual-basic/language-reference/keywords), cased
// as Roslyn writes them (Syntax.xml). Reserved words cannot be identifiers, so
// recasing them is always safe. Unreserved (contextual) keywords are included
// only where they are unlikely to be someone's variable name; Key, Text,
// Binary, Auto, Custom, Assembly, Mid and the LINQ words (From, Where, Group,
// Order, Join, ...) are left alone because a variable called "key" or "text"
// would otherwise be recased.

/** Keywords by highlighting group, each with the TextMate scope it gets. */
export const KEYWORD_GROUPS: { scope: string; words: string[] }[] = [
    {
        scope: "keyword.control.ilogicvb",
        words: [
            "If", "Then", "Else", "ElseIf", "End", "For", "Each", "In", "To", "Step", "Next",
            "While", "Do", "Loop", "Until", "Select", "Case", "Exit", "Continue", "Return",
            "GoTo", "Gosub", "Wend", "Try", "Catch", "Finally", "Throw", "When", "Stop",
            "Yield", "Await", "Resume", "On", "Error", "Call", "With", "Using", "SyncLock",
        ],
    },
    {
        scope: "keyword.declaration.ilogicvb",
        words: [
            "Sub", "Function", "Property", "Get", "Set", "Class", "Module", "Structure",
            "Enum", "Interface", "Namespace", "Event", "Delegate", "Declare", "Lib", "Alias",
            "Ansi", "Unicode", "Operator", "Dim", "Const", "ReDim", "Preserve", "Erase", "Let",
            "As", "Of", "New", "Imports", "Inherits", "Implements", "Handles",
            "Option", "Strict", "Explicit", "Compare", "Infer", "Off",
        ],
    },
    {
        scope: "keyword.modifier.ilogicvb",
        words: [
            "Public", "Private", "Protected", "Friend", "Shared", "Static", "ReadOnly",
            "WriteOnly", "Overrides", "Overridable", "MustOverride", "NotOverridable",
            "Overloads", "MustInherit", "NotInheritable", "Shadows", "Partial", "Default",
            "Widening", "Narrowing", "WithEvents", "Async", "Iterator", "ByVal", "ByRef",
            "Optional", "ParamArray", "Out",
        ],
    },
    {
        scope: "keyword.operator.word.ilogicvb",
        words: [
            "And", "AndAlso", "Or", "OrElse", "Not", "Xor", "Is", "IsNot", "Like", "Mod",
            "TypeOf", "GetType", "NameOf", "AddressOf", "GetXmlNamespace", "IsTrue", "IsFalse",
            "DirectCast", "TryCast", "CType", "CBool", "CByte", "CChar", "CDate", "CDbl",
            "CDec", "CInt", "CLng", "CObj", "CSByte", "CShort", "CSng", "CStr", "CUInt",
            "CULng", "CUShort", "AddHandler", "RemoveHandler", "RaiseEvent",
        ],
    },
    {
        scope: "storage.type.ilogicvb",
        words: [
            "Boolean", "Byte", "SByte", "Short", "UShort", "Integer", "UInteger", "Long",
            "ULong", "Single", "Double", "Decimal", "String", "Char", "Date", "Object", "Variant",
        ],
    },
    {
        scope: "constant.language.ilogicvb",
        words: ["True", "False", "Nothing"],
    },
    {
        scope: "variable.language.ilogicvb",
        words: ["Me", "MyBase", "MyClass", "Global"],
    },
];

// Old one-word spellings, rewritten to the two-word form VB.NET expects
const LEGACY_SPELLINGS: Record<string, string> = {
    endif: "End If",
    endwhile: "End While",
    endselect: "End Select",
    endtry: "End Try",
    endsub: "End Sub",
    endfunction: "End Function",
    endproperty: "End Property",
    endclass: "End Class",
    endinterface: "End Interface",
    endstructure: "End Structure",
    endenum: "End Enum",
    endmodule: "End Module",
    endnamespace: "End Namespace",
    endwith: "End With",
    endusing: "End Using",
    endsynclock: "End SyncLock",
};

/** Canonical casing, keyed by the lowercase word. */
export const VB_KEYWORDS: Record<string, string> = {
    ...Object.fromEntries(KEYWORD_GROUPS.flatMap((g) => g.words.map((w) => [w.toLowerCase(), w]))),
    ...LEGACY_SPELLINGS,
};
