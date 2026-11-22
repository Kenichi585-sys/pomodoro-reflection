from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler


# DRFの入力エラーを、Reactで共通処理できるerrors形式にそろえる。
def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, ValidationError):
        response.data = {"errors": response.data}

    return response
