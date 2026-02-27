import Foundation

struct Projection {
    let pessimistic: Double
    let expected: Double
    let optimistic: Double
    let years: Int
}

enum ProjectionEngine {

    struct Rates {
        let pessimistic: Double
        let expected: Double
        let optimistic: Double
    }

    static let annualRates: [AssetCategory: Rates] = [
        .fiat:   Rates(pessimistic: -0.05, expected: -0.03, optimistic: -0.01),
        .stock:  Rates(pessimistic: 0.04,  expected: 0.08,  optimistic: 0.12),
        .crypto: Rates(pessimistic: -0.10, expected: 0.15,  optimistic: 0.40),
    ]

    static func compoundGrowth(presentValue: Double, annualRate: Double, years: Int) -> Double {
        presentValue * pow(1 + annualRate, Double(years))
    }

    static func project(holdings: [PortfolioHolding], years: Int) -> Projection {
        var pessimisticTotal = 0.0
        var expectedTotal = 0.0
        var optimisticTotal = 0.0

        for holding in holdings {
            let rates = annualRates[holding.category] ?? Rates(pessimistic: 0, expected: 0, optimistic: 0)
            let value = holding.totalValue

            pessimisticTotal += compoundGrowth(presentValue: value, annualRate: rates.pessimistic, years: years)
            expectedTotal += compoundGrowth(presentValue: value, annualRate: rates.expected, years: years)
            optimisticTotal += compoundGrowth(presentValue: value, annualRate: rates.optimistic, years: years)
        }

        return Projection(
            pessimistic: pessimisticTotal,
            expected: expectedTotal,
            optimistic: optimisticTotal,
            years: years
        )
    }
}
