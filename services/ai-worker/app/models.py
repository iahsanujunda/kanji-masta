from pydantic import BaseModel


class AnalyzePhotoRequest(BaseModel):
    imageUrl: str
    userId: str | None = None
    sessionId: str


class GenerateQuizzesRequest(BaseModel):
    pass  # empty body — uses trace headers


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
