class ApiError(Exception):
    """An error returned to the client as {"code", "message"} with an HTTP status."""

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def not_prepared(reason):
    return ApiError(409, "NOT_PREPARED", reason)
