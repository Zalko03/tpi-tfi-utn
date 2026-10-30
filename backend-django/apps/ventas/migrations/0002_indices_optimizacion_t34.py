# Generated for T3.4 PostgreSQL query optimization

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ventas", "0001_initial"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="venta",
            index=models.Index(fields=["fecha"], name="idx_venta_fecha"),
        ),
        migrations.AddIndex(
            model_name="venta",
            index=models.Index(
                fields=["-fecha", "-id"], name="idx_venta_fecha_id_desc"
            ),
        ),
        migrations.AddIndex(
            model_name="ventaitem",
            index=models.Index(
                fields=["venta", "producto"], name="idx_ventaitem_venta_prod"
            ),
        ),
        migrations.AddIndex(
            model_name="ventaitem",
            index=models.Index(
                fields=["producto", "venta"], name="idx_ventaitem_prod_venta"
            ),
        ),
    ]
