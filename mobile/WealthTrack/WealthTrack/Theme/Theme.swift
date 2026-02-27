import SwiftUI

enum Theme {
    // MARK: - Colors

    static let bgPrimary = Color("BgPrimary")
    static let bgCard = Color("BgCard")

    static let sage = Color(light: .init(hex: 0x6BA38E), dark: .init(hex: 0x7DB8A3))
    static let coral = Color(light: .init(hex: 0xE8836B), dark: .init(hex: 0xF09580))
    static let lavender = Color(light: .init(hex: 0x9B8EC4), dark: .init(hex: 0xB0A4D4))
    static let amber = Color(light: .init(hex: 0xE8B44C), dark: .init(hex: 0xF0C460))
    static let textMuted = Color(light: .init(hex: 0x8A857E), dark: .init(hex: 0x9E99A8))

    static let cryptoTint = Color(light: .init(hex: 0xF3F0FA), dark: .init(hex: 0x2E2A3A))
    static let stockTint = Color(light: .init(hex: 0xEFF6F2), dark: .init(hex: 0x242E29))
    static let fiatTint = Color(light: .init(hex: 0xFBF6EC), dark: .init(hex: 0x302C22))

    // MARK: - Typography

    static let largeValue = Font.system(size: 34, weight: .bold, design: .rounded)
    static let titleFont = Font.system(size: 22, weight: .bold, design: .rounded)
    static let headlineFont = Font.system(size: 17, weight: .semibold, design: .rounded)
    static let bodyFont = Font.system(size: 15, weight: .regular, design: .rounded)
    static let captionFont = Font.system(size: 13, weight: .regular, design: .rounded)

    // MARK: - Spacing

    static let cardCornerRadius: CGFloat = 20
    static let cardPadding: CGFloat = 20
    static let sectionSpacing: CGFloat = 20

    // MARK: - Category Helpers

    static func categoryColor(_ category: AssetCategory) -> Color {
        switch category {
        case .crypto: return lavender
        case .stock: return sage
        case .fiat: return amber
        }
    }

    static func categoryTint(_ category: AssetCategory) -> Color {
        switch category {
        case .crypto: return cryptoTint
        case .stock: return stockTint
        case .fiat: return fiatTint
        }
    }

    static func riskColor(_ value: Int) -> Color {
        switch value {
        case 1...3: return sage
        case 4...6: return amber
        default: return coral
        }
    }
}

// MARK: - Color Extensions

extension Color {
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }

    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

// MARK: - Card Modifier

struct ThemeCard: ViewModifier {
    var tint: Color?

    func body(content: Content) -> some View {
        content
            .padding(Theme.cardPadding)
            .background(
                RoundedRectangle(cornerRadius: Theme.cardCornerRadius)
                    .fill(tint ?? Theme.bgCard)
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
            )
    }
}

extension View {
    func themeCard(tint: Color? = nil) -> some View {
        modifier(ThemeCard(tint: tint))
    }

    func cardAppearance(index: Int, appeared: Bool) -> some View {
        self
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 20)
            .animation(.easeOut(duration: 0.4).delay(Double(index) * 0.1), value: appeared)
    }
}
