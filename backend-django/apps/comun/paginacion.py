"""Paginación estándar para DRF respetando el contrato de la cátedra."""
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PaginacionEstandar(PageNumberPagination):
    page_query_param = "pagina"
    page_size_query_param = "limite"
    page_size = 10
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            "datos": data,
            "pagina": self.page.number,
            "limite": self.get_page_size(self.request),
            "total": self.page.paginator.count,
        })
