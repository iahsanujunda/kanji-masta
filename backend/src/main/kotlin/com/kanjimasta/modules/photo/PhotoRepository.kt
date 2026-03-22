package com.kanjimasta.modules.photo

import com.kanjimasta.core.db.DataConnectClient
import kotlinx.serialization.json.*

class PhotoRepository(private val dc: DataConnectClient) {

    suspend fun createSession(userId: String, imageUrl: String): String {
        val query = """
            mutation {
                photoSession_insert(data: {
                    userId: "${userId.escape()}",
                    imageUrl: "${imageUrl.escape()}"
                })
            }
        """.trimIndent()

        val result = dc.executeGraphql(query)
        return result["data"]!!.jsonObject["photoSession_insert"]!!.jsonObject["id"]!!.jsonPrimitive.content
    }

    suspend fun getSession(sessionId: String): PhotoSessionRow? {
        val query = """
            query {
                photoSession(id: "$sessionId") {
                    id
                    rawAiResponse
                    costMicrodollars
                }
            }
        """.trimIndent()

        val result = dc.executeGraphql(query)
        val session = result["data"]?.jsonObject?.get("photoSession") ?: return null
        if (session is JsonNull) return null

        val obj = session.jsonObject
        return PhotoSessionRow(
            id = obj["id"]!!.jsonPrimitive.content,
            rawAiResponse = obj["rawAiResponse"]?.jsonPrimitive?.contentOrNull,
            costMicrodollars = obj["costMicrodollars"]?.jsonPrimitive?.longOrNull,
        )
    }

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"")
}

data class PhotoSessionRow(
    val id: String,
    val rawAiResponse: String?,
    val costMicrodollars: Long?,
)
