import UIKit

/// Renders Tiptap/ProseMirror JSON (`RichTextNode`) to an `NSAttributedString` in the Continuity style.
enum RichTextRenderer {
    static func attributedString(for doc: RichTextNode, baseSize: CGFloat = 17) -> NSAttributedString {
        let builder = Builder(baseSize: baseSize)
        builder.block(doc, context: Context())
        let result = builder.output
        // Drop the trailing paragraph separator.
        if result.string.hasSuffix("\n") {
            result.deleteCharacters(in: NSRange(location: result.length - 1, length: 1))
        }
        return result
    }

    private struct Context {
        var listDepth = 0
        var quoteDepth = 0
        var inList: Bool { listDepth > 0 }
    }

    private final class Builder {
        let baseSize: CGFloat
        let output = NSMutableAttributedString()
        /// Marker waiting to be placed at the start of the next paragraph (list item).
        var pendingMarker: (text: String, color: UIColor)?
        private let step: CGFloat = 22

        init(baseSize: CGFloat) { self.baseSize = baseSize }

        private var ink: UIColor { ContinuityTheme.Color.ink }

        func block(_ node: RichTextNode, context: Context) {
            switch node.type {
            case "paragraph":
                paragraph(node, context: context, font: bodyFont, spacing: context.inList ? 4 : 10)
            case "heading":
                let level = min(max(node.attrs?["level"]?.int ?? 2, 1), 6)
                let sizes: [CGFloat] = [1.7, 1.4, 1.2, 1.08, 1.0, 0.95]
                let size = baseSize * sizes[level - 1]
                paragraph(node, context: context, font: ContinuityTheme.Font.display(size, weight: .semibold), spacing: 8, before: level <= 2 ? 10 : 6)
            case "bulletList", "orderedList":
                list(node, context: context)
            case "taskList":
                var inner = context
                inner.listDepth += 1
                for item in node.content ?? [] { listItem(item, context: inner, marker: nil, task: true) }
            case "blockquote":
                var inner = context
                inner.quoteDepth += 1
                for child in node.content ?? [] { block(child, context: inner) }
            case "horizontalRule":
                let style = NSMutableParagraphStyle()
                style.alignment = .center
                style.paragraphSpacing = 10
                style.paragraphSpacingBefore = 6
                output.append(NSAttributedString(string: "· · ·\n", attributes: [
                    .font: ContinuityTheme.Font.caption(baseSize),
                    .foregroundColor: ContinuityTheme.Color.secondaryInk,
                    .paragraphStyle: style,
                ]))
            case "codeBlock":
                let style = NSMutableParagraphStyle()
                let indent = leading(context)
                style.firstLineHeadIndent = indent
                style.headIndent = indent
                style.paragraphSpacing = 12
                style.lineSpacing = 2
                let text = (node.content ?? []).map { $0.text ?? "" }.joined()
                output.append(NSAttributedString(string: text + "\n", attributes: [
                    .font: UIFont.monospacedSystemFont(ofSize: baseSize * 0.85, weight: .regular),
                    .foregroundColor: ink,
                    .backgroundColor: ContinuityTheme.Color.paleLavender,
                    .paragraphStyle: style,
                ]))
            case "text", "hardBreak":
                // Stray inline node at block level: wrap it.
                paragraph(RichTextNode(type: "paragraph", content: [node]), context: context, font: bodyFont, spacing: 10)
            default:
                for child in node.content ?? [] { block(child, context: context) }
            }
        }

        private var bodyFont: UIFont { ContinuityTheme.Font.text(baseSize) }

        /// Left edge of text for the current nesting.
        private func leading(_ context: Context) -> CGFloat {
            CGFloat(context.listDepth) * step + CGFloat(context.quoteDepth) * 16
        }

        private func list(_ node: RichTextNode, context: Context) {
            var inner = context
            inner.listDepth += 1
            let ordered = node.type == "orderedList"
            var number = node.attrs?["start"]?.int ?? 1
            for item in node.content ?? [] {
                if item.type == "listItem" || item.type == "taskItem" {
                    let marker = ordered ? "\(number)." : (inner.listDepth % 2 == 1 ? "•" : "–")
                    listItem(item, context: inner, marker: marker, task: item.type == "taskItem")
                    number += 1
                } else {
                    block(item, context: inner)
                }
            }
        }

        private func listItem(_ node: RichTextNode, context: Context, marker: String?, task: Bool) {
            if task {
                let checked = node.attrs?["checked"]?.bool ?? false
                pendingMarker = (checked ? "\u{2611}" : "\u{2610}", checked ? ContinuityTheme.Color.teal : ContinuityTheme.Color.secondaryInk)
            } else {
                pendingMarker = marker.map { ($0, ContinuityTheme.Color.secondaryInk) }
            }
            for child in node.content ?? [] { block(child, context: context) }
            // A list item with no paragraph still shows its marker.
            if let pending = pendingMarker {
                pendingMarker = nil
                emit(NSMutableAttributedString(), marker: pending, context: context, font: bodyFont, spacing: 4, before: 0)
            }
        }

        private func paragraph(_ node: RichTextNode, context: Context, font: UIFont, spacing: CGFloat, before: CGFloat = 0) {
            let text = NSMutableAttributedString()
            var color = ink
            if context.quoteDepth > 0 { color = ContinuityTheme.Color.secondaryInk }
            for child in node.content ?? [] { inline(child, into: text, font: font, color: color, marks: []) }
            let marker = pendingMarker
            pendingMarker = nil
            emit(text, marker: marker, context: context, font: font, spacing: spacing, before: before)
        }

        private func emit(_ text: NSMutableAttributedString, marker: (text: String, color: UIColor)?, context: Context, font: UIFont, spacing: CGFloat, before: CGFloat) {
            let style = NSMutableParagraphStyle()
            let left = leading(context)
            style.headIndent = left
            style.lineSpacing = baseSize * 0.28
            style.paragraphSpacing = spacing
            style.paragraphSpacingBefore = before
            if marker != nil {
                style.firstLineHeadIndent = left - step
                style.tabStops = [NSTextTab(textAlignment: .left, location: left)]
                style.defaultTabInterval = step
            } else {
                style.firstLineHeadIndent = left
            }
            let result = NSMutableAttributedString()
            if let marker {
                result.append(NSAttributedString(string: marker.text + "\t", attributes: [
                    .font: font, .foregroundColor: marker.color,
                ]))
            }
            result.append(text)
            result.append(NSAttributedString(string: "\n", attributes: [.font: font]))
            result.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: result.length))
            output.append(result)
        }

        private func inline(_ node: RichTextNode, into out: NSMutableAttributedString, font: UIFont, color: UIColor, marks inherited: [RichTextNode.Mark]) {
            switch node.type {
            case "text":
                let marks = (node.marks ?? [])
                var attrs: [NSAttributedString.Key: Any] = [.foregroundColor: color]
                var traits: UIFontDescriptor.SymbolicTraits = []
                var isCode = false
                for mark in marks {
                    switch mark.type {
                    case "bold", "strong": traits.insert(.traitBold)
                    case "italic", "em": traits.insert(.traitItalic)
                    case "strike": attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
                    case "underline": attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
                    case "code": isCode = true
                    case "link":
                        if let href = mark.attrs?["href"]?.string, let url = URL(string: href) {
                            attrs[.link] = url
                        }
                    default: break
                    }
                }
                var resolved = font
                if isCode {
                    resolved = UIFont.monospacedSystemFont(ofSize: font.pointSize * 0.88, weight: traits.contains(.traitBold) ? .semibold : .regular)
                    attrs[.backgroundColor] = ContinuityTheme.Color.paleLavender
                } else if !traits.isEmpty {
                    let combined = font.fontDescriptor.symbolicTraits.union(traits)
                    if let descriptor = font.fontDescriptor.withSymbolicTraits(combined) {
                        resolved = UIFont(descriptor: descriptor, size: font.pointSize)
                    }
                }
                attrs[.font] = resolved
                out.append(NSAttributedString(string: node.text ?? "", attributes: attrs))
            case "hardBreak":
                out.append(NSAttributedString(string: "\u{2028}", attributes: [.font: font]))
            default:
                for child in node.content ?? [] { inline(child, into: out, font: font, color: color, marks: inherited) }
            }
        }
    }
}
