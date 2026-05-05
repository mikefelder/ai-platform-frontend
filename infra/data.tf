# -----------------------------------------------------------------------------
# Data sources — reference existing ALZ resources
# -----------------------------------------------------------------------------

data "azurerm_resource_group" "alz" {
  name = var.resource_group_name
}

data "azurerm_container_app_environment" "alz" {
  name                = var.container_app_environment_name
  resource_group_name = data.azurerm_resource_group.alz.name
}

data "azurerm_container_registry" "alz" {
  name                = var.container_registry_name
  resource_group_name = data.azurerm_resource_group.alz.name
}
