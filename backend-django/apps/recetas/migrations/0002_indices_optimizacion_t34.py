# Generated for T3.4 PostgreSQL query optimization

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recetas", "0001_initial"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="producto",
            index=models.Index(
                fields=["estado_activo", "nombre"],
                name="idx_producto_activo_nombre",
            ),
        ),
        migrations.AddIndex(
            model_name="recetaitem",
            index=models.Index(
                fields=["insumo", "producto"],
                name="idx_recetaitem_insumo_prod",
            ),
        ),
    ]
