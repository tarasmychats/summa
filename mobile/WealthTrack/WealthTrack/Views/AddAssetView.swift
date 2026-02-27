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
                        .foregroundStyle(.secondary)
                }
            } else if isSearching {
                Section {
                    HStack {
                        ProgressView()
                        Text("Searching...")
                            .foregroundStyle(.secondary)
                    }
                }
            } else if let error = searchError {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                }
            } else if searchResults.isEmpty {
                Section {
                    Text("No results for \"\(searchText)\"")
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(AssetCategory.allCases, id: \.self) { category in
                    let assets = searchResults.filter { $0.category == category }
                    if !assets.isEmpty {
                        Section(category.displayName) {
                            ForEach(assets) { asset in
                                Button {
                                    selectedAsset = asset
                                } label: {
                                    HStack {
                                        Image(systemName: category.iconName)
                                            .foregroundStyle(.secondary)
                                        VStack(alignment: .leading) {
                                            Text(asset.name)
                                            Text(asset.symbol)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
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

    private func amountInput(for asset: AssetDefinition) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Text(asset.name)
                .font(.title2.bold())

            TextField("Amount", text: $amount)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .font(.title)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Text("How much \(asset.symbol) do you own?")
                .foregroundStyle(.secondary)

            Button("Add to Portfolio") {
                saveAsset(asset)
            }
            .buttonStyle(.borderedProminent)
            .disabled(Double(amount) == nil || Double(amount)! <= 0)

            Button("Back") {
                selectedAsset = nil
                amount = ""
            }
            .foregroundStyle(.secondary)

            Spacer()
        }
    }

    private var upgradePrompt: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("Free Limit Reached")
                .font(.title2.bold())
            Text("Upgrade to Premium to track unlimited assets.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Maybe Later") { dismiss() }
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }

    private func saveAsset(_ definition: AssetDefinition) {
        guard let value = Double(amount), value > 0 else { return }

        let asset = Asset(
            name: definition.name,
            symbol: definition.id,
            category: definition.category,
            amount: value
        )
        modelContext.insert(asset)
        dismiss()
    }
}
