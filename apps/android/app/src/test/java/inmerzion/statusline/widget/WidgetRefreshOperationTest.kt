package inmerzion.statusline.widget

import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.StatuslineException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetRefreshOperationTest {
    @Test fun backgroundRunFetchesBeforeRenderingWithoutOpeningTheApp() {
        val calls = mutableListOf<String>()
        val result = operation(refresh = { calls += "relay" }, render = { calls += "widget" }).run(0)
        assertEquals(WidgetRefreshOutcome.UPDATED, result)
        assertEquals(listOf("relay", "widget"), calls)
    }

    @Test fun noWidgetUnpairedAndDemoNeverFetchOrRender() {
        for ((widgets, paired, demo) in listOf(Triple(false, true, false), Triple(true, false, false), Triple(true, true, true))) {
            var calls = 0
            val result = operation(widgets, paired, demo, { calls++ }, { calls++ }).run(0)
            assertEquals(WidgetRefreshOutcome.SKIPPED, result)
            assertEquals(0, calls)
        }
    }

    @Test fun transientFailuresRetryWithABoundedBudgetAndDoNotReplaceTheCache() {
        for (kind in listOf(FailureKind.NETWORK, FailureKind.TIMEOUT, FailureKind.RATE_LIMITED)) {
            var renders = 0
            val run = operation(refresh = { throw StatuslineException(kind, "Fixture") }, render = { renders++ })
            for (attempt in 0 until WidgetRefreshPolicy.MAX_RETRIES) {
                assertEquals(WidgetRefreshOutcome.RETRY, run.run(attempt))
            }
            assertEquals(WidgetRefreshOutcome.SKIPPED, run.run(WidgetRefreshPolicy.MAX_RETRIES))
            assertEquals(0, renders)
        }
    }

    @Test fun PermanentFailuresAndUnknownExceptionsDoNotCreateARetryLoop() {
        for (kind in FailureKind.entries.filterNot { WidgetRefreshPolicy.shouldRetry(it, 0) }) {
            assertEquals(WidgetRefreshOutcome.SKIPPED,
                operation(refresh = { throw StatuslineException(kind, "Fixture") }).run(0))
        }
        assertEquals(WidgetRefreshOutcome.SKIPPED, operation(refresh = { error("Fixture") }).run(0))
    }

    @Test fun eligibilityAndCadenceMatchTheDocumentedPolicy() {
        assertEquals(30L, WidgetRefreshPolicy.INTERVAL_MINUTES)
        assertTrue(WidgetRefreshPolicy.shouldSync(true, true, false))
        assertFalse(WidgetRefreshPolicy.shouldSync(false, true, false))
        assertFalse(WidgetRefreshPolicy.shouldSync(true, false, false))
        assertFalse(WidgetRefreshPolicy.shouldSync(true, true, true))
    }

    private fun operation(
        widgets: Boolean = true,
        paired: Boolean = true,
        demo: Boolean = false,
        refresh: () -> Unit = {},
        render: () -> Unit = {},
    ) = WidgetRefreshOperation({ widgets }, { paired }, { demo }, refresh, render)
}
