import SwiftUI
import SwiftData

struct AddAssetView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allAssets: [Asset]

    @State private var searchText = ""
    @State private var selectedAsset: AssetDefinition?
    @State private var amount = ""
    @State private var searchResults: [AssetDefinition] = []
    @State private var isSearching = false
    @State private var searchError: String?
    @State private var searchTask: Task<Void, Never>?
    @State private var savedTrigger = 0
    @State private var duplicateAsset: AssetDefinition?

    private var existingAssetIDs: Set<String> {
        DuplicateAssetDetector.existingAssetIDs(from: allAssets)
    }

    var body: some View {
        NavigationStack {
            VStack {
                if !PremiumGate.canAddAsset(currentCount: allAssets.count, isPremium: false) {
                    upgradePrompt
                } else if let selected = selectedAsset {
                    amountInput(for: selected)
                } else {
                    assetPicker
                }
            }
            .background(Theme.bgPrimary)
            .sensoryFeedback(.success, trigger: savedTrigger)
            .alert("Already Added",
                   isPresented: Binding(
                       get: { duplicateAsset != nil },
                       set: { if !$0 { duplicateAsset = nil } }
                   )
            ) {
                Button("Add Anyway") {
                    if let asset = duplicateAsset {
                        selectedAsset = asset
                        duplicateAsset = nil
                    }
                }
                Button("Cancel", role: .cancel) {
                    duplicateAsset = nil
                }
            } message: {
                if let asset = duplicateAsset {
                    Text("\(asset.name) is already in your portfolio. Add another?")
                }
            }
            .navigationTitle("Add Asset")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var assetPicker: some View {
        List {
            if searchText.isEmpty {
                Section {
                    Text("Type to search for crypto, stocks, ETFs, or currencies")
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.textMuted)
                }
                .listRowBackground(Theme.bgCard)
            } else if isSearching {
                Section {
                    HStack {
                        ProgressView()
                        Text("Searching...")
                            .font(Theme.bodyFont)
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                .listRowBackground(Theme.bgCard)
            } else if let error = searchError {
                Section {
                    Text(error)
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.coral)
                }
                .listRowBackground(Theme.bgCard)
            } else if searchResults.isEmpty {
                Section {
                    Text("No results for \"\(searchText)\"")
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.textMuted)
                }
                .listRowBackground(Theme.bgCard)
            } else {
                ForEach(AssetCategory.allCases, id: \.self) { category in
                    let assets = searchResults.filter { $0.category == category }
                    if !assets.isEmpty {
                        Section(category.displayName) {
                            ForEach(assets) { asset in
                                let alreadyAdded = DuplicateAssetDetector.isAlreadyAdded(asset, existingIDs: existingAssetIDs)
                                Button {
                                    if alreadyAdded {
                                        duplicateAsset = asset
                                    } else {
                                        selectedAsset = asset
                                    }
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: category.iconName)
                                            .font(.system(size: 16))
                                            .foregroundStyle(Theme.categoryColor(category))
                                            .frame(width: 36, height: 36)
                                            .background(Theme.categoryTint(category))
                                            .clipShape(Circle())
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(asset.name)
                                                .font(Theme.bodyFont)
                                            HStack(spacing: 6) {
                                                Text(asset.symbol)
                                                    .font(Theme.captionFont)
                                                    .foregroundStyle(Theme.textMuted)
                                                Text(category.displayName)
                                                    .font(.system(size: 11, weight: .medium, design: .rounded))
                                                    .foregroundStyle(Theme.categoryColor(category))
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(Theme.categoryTint(category))
                                                    .clipShape(Capsule())
                                            }
                                        }
                                        if alreadyAdded {
                                            Spacer()
                                            HStack(spacing: 4) {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .foregroundStyle(Theme.sage)
                                                Text("Added")
                                                    .font(Theme.captionFont)
                                                    .foregroundStyle(Theme.textMuted)
                                            }
                                        }
                                    }
                                }
                                .listRowBackground(Theme.bgCard)
                            }
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bgPrimary)
        .searchable(text: $searchText, prompt: "Search crypto, stocks, currencies...")
        .onChange(of: searchText) { _, newValue in
            debounceSearch(query: newValue)
        }
    }

    private func debounceSearch(query: String) {
        searchTask?.cancel()

        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            searchResults = []
            searchError = nil
            isSearching = false
            return
        }

        isSearching = true
        searchError = nil

        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))

            guard !Task.isCancelled else { return }

            do {
                let results = try await PriceAPIClient.shared.searchAssets(query: query)
                guard !Task.isCancelled else { return }

                searchResults = results.map { AssetDefinition(from: $0) }
                searchError = nil
            } catch {
                guard !Task.isCancelled else { return }
                searchResults = []
                searchError = "Search failed. Check your connection."
            }
            isSearching = false
        }
    }

    private var parsedAmount: Double? {
        // Try period separator first (POSIX), then locale-aware parsing (handles comma)
        if let value = Double(amount) { return value }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = .current
        return formatter.number(from: amount)?.doubleValue
    }

    private func amountInput(for asset: AssetDefinition) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Text(asset.name)
                .font(Theme.titleFont)

            TextField("Amount", text: $amount)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .font(Theme.largeValue)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Text("How much \(asset.symbol) do you own?")
                .font(Theme.bodyFont)
                .foregroundStyle(Theme.textMuted)

            Button("Add to Portfolio") {
                saveAsset(asset)
            }
            .buttonStyle(.borderedProminent)
            .disabled(parsedAmount == nil || parsedAmount! <= 0)

            Button("Back") {
                selectedAsset = nil
                amount = ""
            }
            .font(Theme.bodyFont)
            .foregroundStyle(Theme.textMuted)

            Spacer()
        }
    }

    private var upgradePrompt: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundStyle(Theme.textMuted)
            Text("Free Limit Reached")
                .font(Theme.titleFont)
            Text("Upgrade to Premium to track unlimited assets.")
                .font(Theme.bodyFont)
                .foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
            Button("Maybe Later") { dismiss() }
                .font(Theme.bodyFont)
                .foregroundStyle(Theme.textMuted)
            Spacer()
        }
        .padding()
    }

    private func saveAsset(_ definition: AssetDefinition) {
        guard let value = parsedAmount, value > 0 else { return }

        let asset = Asset(
            name: definition.name,
            symbol: definition.id,
            ticker: definition.symbol,
            category: definition.category,
            amount: value
        )
        modelContext.insert(asset)
        savedTrigger += 1
        dismiss()
    }
}
