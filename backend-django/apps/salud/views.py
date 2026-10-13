from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def obtener_estado(request):
    # No consulta la base: indica solo que el proceso está vivo.
    return JsonResponse({'estado': 'ok', 'servicio': 'backend-django'})
