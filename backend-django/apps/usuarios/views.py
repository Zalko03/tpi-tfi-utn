"""
Controladores delgados (Views y ViewSets) para autenticación JWT y gestión de personal.
La lógica de negocio reside estrictamente en services.py (convenciones-python.md §2).
"""

from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.comun.filtros import filtrar_queryset_por_rango_fechas
from apps.comun.throttling import CambioClaveRateThrottle, LoginRateThrottle
from apps.usuarios import services
from apps.usuarios.models import PedidoRestablecimientoClave, RegistroAuditoria
from apps.usuarios.permissions import TienePermiso
from apps.usuarios.serializers import (
    AjustarPermisosSerializer,
    CambiarClaveSerializer,
    DemoAccesoSerializer,
    DesactivarUsuarioSerializer,
    OlvideClaveSerializer,
    RegistroAuditoriaSerializer,
    RestablecerClaveSerializer,
    UsuarioActualizarSerializer,
    UsuarioCrearSerializer,
    UsuarioSerializer,
)
from apps.usuarios.tokens import (
    CustomTokenObtainPairSerializer,
    CustomTokenRefreshSerializer,
)

User = get_user_model()


class LoginView(TokenObtainPairView):
    """
    Endpoint de login (POST /api/auth/token/).
    Emite par de tokens JWT RS256 con claims estándar y de dominio (ADR-0001).
    Aplica rate limiting estricto para mitigar ataques de fuerza bruta (T2.5).
    """

    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = (AllowAny,)
    throttle_classes = (LoginRateThrottle,)


class RefreshView(TokenRefreshView):
    """
    Endpoint de refresco (POST /api/auth/token/refresh/).
    Valida usuario activo y reempaqueta claims vigentes de rol y permisos.
    """

    serializer_class = CustomTokenRefreshSerializer
    permission_classes = (AllowAny,)


class LogoutView(APIView):
    """
    Endpoint de cierre de sesión (POST /api/auth/token/blacklist/ o /api/auth/logout/).
    Revoca el refresh token enviándolo a la lista negra (Blacklist).
    """

    permission_classes = (AllowAny,)

    def post(self, request):
        refresh_str = request.data.get("refresh")
        if not refresh_str:
            return Response(
                {
                    "mensaje": "Falta el dato de sesión para cerrarla.",
                    "detalles": None,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_str)
            token.blacklist()
            return Response(
                {
                    "mensaje": "Sesión cerrada correctamente.",
                    "detalles": None,
                },
                status=status.HTTP_200_OK,
            )
        except Exception:
            return Response(
                {
                    "mensaje": "Tu sesión ya venció o no es válida.",
                    "detalles": None,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class CambiarClaveView(APIView):
    """
    POST /api/auth/cambiar-clave/: el usuario autenticado cambia su propia contraseña.
    Devuelve tokens nuevos porque las sesiones anteriores quedan cerradas.
    """

    permission_classes = (IsAuthenticated,)
    throttle_classes = (CambioClaveRateThrottle,)

    def post(self, request):
        serializer = CambiarClaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = services.cambiar_clave_propia(
            usuario=request.user,
            clave_actual=serializer.validated_data["clave_actual"],
            clave_nueva=serializer.validated_data["clave_nueva"],
        )
        return Response(
            {
                "mensaje": "Contraseña cambiada. Cerramos tus sesiones en otros dispositivos.",
                **datos,
            },
            status=status.HTTP_200_OK,
        )


class OlvideClaveView(APIView):
    """
    POST /api/auth/olvide-clave/: pedido "¿Olvidaste tu contraseña?" desde el login.
    Responde siempre lo mismo, exista o no el usuario, para no revelar cuentas.
    """

    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (LoginRateThrottle,)

    def post(self, request):
        serializer = OlvideClaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.solicitar_restablecimiento_clave(serializer.validated_data["username"])
        return Response(
            {
                "mensaje": (
                    "Listo. Si el usuario existe, el dueño del local va a ver tu pedido "
                    "y te va a pasar una contraseña nueva."
                ),
                "detalles": None,
            },
            status=status.HTTP_200_OK,
        )


class DemoAccesoView(APIView):
    """
    Acceso rápido sin contraseña para demostración local (GET/POST /api/auth/demo/).
    Solo responde disponible y emite tokens si DEMO_ACCESO_RAPIDO=True y DEBUG=True.
    """

    permission_classes = (AllowAny,)

    def get_throttles(self):
        if self.request.method == "POST":
            return [LoginRateThrottle()]
        return super().get_throttles()

    def get(self, request):
        return Response(
            {"disponible": services.demo_acceso_rapido_habilitado()},
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        if not services.demo_acceso_rapido_habilitado():
            raise NotFound()

        serializer = DemoAccesoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        datos = services.autenticar_demo_rapido(
            perfil=serializer.validated_data["perfil"],
        )
        return Response(datos, status=status.HTTP_200_OK)


class UsuarioViewSet(viewsets.ModelViewSet):
    """
    CRUD y acciones de personal protegidas por permisos granulares (docs/seguridad.md §5).
    """

    queryset = (
        User.objects.select_related("perfil")
        .prefetch_related(
            Prefetch(
                "pedidos_clave",
                queryset=PedidoRestablecimientoClave.objects.filter(atendido=False),
                to_attr="pedidos_clave_pendientes",
            )
        )
        .all()
        .order_by("-date_joined")
    )
    serializer_class = UsuarioSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("personal.ver")()]
        elif self.action == "create":
            return [TienePermiso("personal.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("personal.editar")()]
        elif self.action in ("destroy", "desactivar"):
            return [TienePermiso("personal.desactivar")()]
        elif self.action == "activar":
            return [TienePermiso("personal.desactivar")()]
        elif self.action == "ajustar_permisos":
            return [TienePermiso("personal.ajustar_permisos")()]
        elif self.action in ("me", "restablecer_clave"):
            # restablecer_clave decide por rol en services.puede_restablecer_clave
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = UsuarioCrearSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        datos = serializer.validated_data
        rol = datos.pop("rol", "CAJERO")
        permisos = datos.pop("permisos", {})

        usuario = services.crear_personal(
            datos_usuario=datos,
            rol=rol,
            permisos=permisos,
            creado_por=request.user,
            validar_clave=True,
        )

        salida = UsuarioSerializer(usuario)
        return Response(salida.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = UsuarioActualizarSerializer(data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        usuario_obj = self.get_object()
        datos = dict(serializer.validated_data)
        rol = datos.pop("rol", None)
        permisos = datos.pop("permisos", None)

        usuario_actualizado = services.actualizar_personal(
            usuario_id=usuario_obj.id,
            datos_usuario=datos,
            rol=rol,
            permisos=permisos,
            modificado_por=request.user,
        )

        salida = UsuarioSerializer(usuario_actualizado)
        return Response(salida.data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        """Desactivación lógica sin borrado físico de la fila en PostgreSQL."""
        usuario_obj = self.get_object()
        services.desactivar_personal(
            usuario_id=usuario_obj.id,
            motivo="Desactivación vía DELETE HTTP",
            desactivado_por=request.user,
        )
        return Response(
            {
                "mensaje": "Usuario desactivado correctamente.",
                "detalles": None,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="desactivar")
    def desactivar(self, request, pk=None):
        """Acción explícita para desactivación lógica con motivo opcional."""
        serializer = DesactivarUsuarioSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        motivo = serializer.validated_data.get("motivo", "")

        usuario = services.desactivar_personal(
            usuario_id=pk,
            motivo=motivo,
            desactivado_por=request.user,
        )
        return Response(
            {
                "mensaje": "Usuario desactivado exitosamente.",
                "usuario": UsuarioSerializer(usuario).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="activar")
    def activar(self, request, pk=None):
        """Acción para reactivar a un empleado previamente desactivado."""
        usuario = services.activar_personal(
            usuario_id=pk,
            activado_por=request.user,
        )
        return Response(
            {
                "mensaje": "Usuario reactivado exitosamente.",
                "usuario": UsuarioSerializer(usuario).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="ajustar-permisos")
    def ajustar_permisos(self, request, pk=None):
        """Ajusta permisos granulares sobreescribiendo o agregando flags booleanos."""
        serializer = AjustarPermisosSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        permisos = serializer.validated_data["permisos"]
        usuario = services.actualizar_personal(
            usuario_id=pk,
            permisos=permisos,
            modificado_por=request.user,
        )
        return Response(
            {
                "mensaje": "Permisos actualizados exitosamente.",
                "usuario": UsuarioSerializer(usuario).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="restablecer-clave")
    def restablecer_clave(self, request, pk=None):
        """Fija una contraseña nueva a otra persona y cierra todas sus sesiones."""
        serializer = RestablecerClaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        usuario = services.restablecer_clave(
            usuario_id=pk,
            clave_nueva=serializer.validated_data["clave_nueva"],
            restablecido_por=request.user,
        )
        return Response(
            {
                "mensaje": "Contraseña restablecida. Se cerraron las sesiones de esa persona.",
                "usuario": UsuarioSerializer(usuario).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """Retorna los datos del usuario autenticado actual con sus permisos efectivos."""
        salida = UsuarioSerializer(request.user)
        return Response(salida.data, status=status.HTTP_200_OK)


class RegistroAuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    """Consulta de logs de auditoría de personal (docs/seguridad.md §2)."""

    queryset = RegistroAuditoria.objects.select_related(
        "usuario_modificado", "modificado_por"
    ).all()
    serializer_class = RegistroAuditoriaSerializer
    permission_classes = (TienePermiso("auditoria.ver_logs"),)

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if self.action == "list":
            qs = filtrar_queryset_por_rango_fechas(
                qs, self.request.query_params, campo_fecha="fecha"
            )
        return qs
