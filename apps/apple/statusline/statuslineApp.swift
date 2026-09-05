//
//  statuslineApp.swift
//  statusline
//
//  Created by Inmerzion on 27/8/26.
//

import SwiftUI

@main
struct statuslineApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.locale, L10n.locale)
        }
    }
}
