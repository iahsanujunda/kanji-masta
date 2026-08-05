package com.kanjimasta.core.db

enum class PhotoSessionStatus(val apiValue: String) {
    PROCESSING("processing"),
    DONE("done"),
    FAILED("failed"),
    INGESTED("ingested");

    companion object {
        fun fromDatabase(value: String): PhotoSessionStatus = when (value.uppercase()) {
            "DONE" -> DONE
            "FAILED", "ERROR" -> FAILED
            "INGESTED" -> INGESTED
            else -> PROCESSING
        }
    }
}

object PhotoFailureCode {
    const val DISPATCH_FAILED = "dispatch_failed"
    const val INVALID_RESPONSE = "invalid_response"
    const val TIMED_OUT = "timed_out"
}
