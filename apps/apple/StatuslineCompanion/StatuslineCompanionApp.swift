import SwiftUI

@main
@MainActor
struct StatuslineCompanionApp: App {
    @State private var viewModel = CompanionViewModel()

    var body: some Scene {
        WindowGroup {
            CompanionContentView(viewModel: viewModel)
        }
        .defaultSize(width: 620, height: 580)
    }
}
