import { defineRule } from "@oxlint/plugins"
import type { ESTree, Variable } from "@oxlint/plugins"

function isTypeScriptFile(filename: string): boolean {
  return filename.endsWith(".ts") || filename.endsWith(".tsx")
}

function isUnknownAnnotation(annotation: ESTree.TSTypeAnnotation | null | undefined): boolean {
  return annotation?.typeAnnotation.type === "TSUnknownKeyword"
}

function parameterAnnotation(
  parameter: ESTree.ParamPattern
): ESTree.TSTypeAnnotation | null | undefined {
  if (parameter.type === "TSParameterProperty") return parameterAnnotation(parameter.parameter)
  if (parameter.type === "AssignmentPattern") {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation
  }
  if (parameter.type === "RestElement") {
    return parameter.typeAnnotation ?? parameter.argument.typeAnnotation
  }
  return parameter.typeAnnotation
}

function variableHasUnknownType(variable: Variable): boolean {
  for (const definition of variable.defs) {
    if (
      definition.type === "Parameter" &&
      isUnknownAnnotation(parameterAnnotation(definition.node))
    ) {
      return true
    }
    if (definition.type === "Variable" && isUnknownAnnotation(definition.node.id.typeAnnotation)) {
      return true
    }
  }
  return false
}

/** Disallow runtime typeof checks that narrow unparsed values instead of decoding them. */
export const noRuntimeTypeofRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
    },
    messages: {
      runtimeTypeof:
        "A runtime `typeof` check only narrows an unparsed representation; it does not establish the expected contract. Parse the value into a strongly typed domain type at the earliest possible point, as close as possible to the I/O boundary where the data originated.",
    },
  },
  create(context) {
    return {
      UnaryExpression(node) {
        if (!isTypeScriptFile(context.filename) || node.operator !== "typeof") return
        if (node.argument.type !== "Identifier") return

        const variable = context.sourceCode.getScope(node.argument).set.get(node.argument.name)
        if (variable === undefined || !variableHasUnknownType(variable)) return

        context.report({ node, messageId: "runtimeTypeof" })
      },
    }
  },
})
