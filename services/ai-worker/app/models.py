from pydantic import BaseModel


class AnalyzePhotoRequest(BaseModel):
    imageUrl: str
    userId: str | None = None
    sessionId: str
    callbackUrl: str | None = None
    callbackKey: str | None = None


class GenerateQuizzesRequest(BaseModel):
    callbackUrl: str | None = None
    callbackStatusUrl: str | None = None
    callbackKey: str | None = None


class DiscoverWordsRequest(BaseModel):
    userId: str
    kanjiId: str
    character: str
    knownWords: list[str] = []


class StatusResponse(BaseModel):
    status: str = "ok"


class ErrorResponse(BaseModel):
    error: str


class DiscoverWordsResponse(BaseModel):
    inserted: int
