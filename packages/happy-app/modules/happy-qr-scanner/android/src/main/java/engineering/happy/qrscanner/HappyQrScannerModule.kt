package engineering.happy.qrscanner

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HappyQrScannerModule : Module() {
    private var pendingPromise: Promise? = null

    override fun definition() = ModuleDefinition {
        Name("HappyQrScanner")

        AsyncFunction("scanQrCode") { promise: Promise ->
            if (pendingPromise != null) {
                promise.reject("ERR_QR_SCANNER_IN_PROGRESS", "A QR scanner is already open.", null)
                return@AsyncFunction
            }

            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject("ERR_QR_SCANNER_NO_ACTIVITY", "Cannot open QR scanner without a current Activity.", null)
                return@AsyncFunction
            }

            pendingPromise = promise
            activity.startActivityForResult(
                Intent(activity, HappyQrScannerActivity::class.java),
                HAPPY_QR_SCANNER_REQUEST_CODE
            )
        }

        OnActivityResult { _, (requestCode, resultCode, data) ->
            if (requestCode != HAPPY_QR_SCANNER_REQUEST_CODE) {
                return@OnActivityResult
            }

            val promise = pendingPromise ?: return@OnActivityResult
            pendingPromise = null

            if (resultCode == Activity.RESULT_OK) {
                promise.resolve(data?.getStringExtra(HAPPY_QR_SCANNER_EXTRA_DATA))
            } else {
                promise.resolve(null)
            }
        }

        OnDestroy {
            pendingPromise?.resolve(null)
            pendingPromise = null
        }
    }
}
