# -----------------------------------------------------------------------------
# UAIP Frontend — Container App
# React SPA served by nginx with reverse proxy to APIM.
# Note: nginx.conf contains hardcoded APIM private IP and hostname.
# Update nginx.conf if deploying to a different environment.
# -----------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "frontend" {
  name                = "id-uaip-frontend"
  location            = data.azurerm_resource_group.alz.location
  resource_group_name = data.azurerm_resource_group.alz.name
  tags                = var.tags
}

resource "azurerm_role_assignment" "frontend_acr_pull" {
  scope                = data.azurerm_container_registry.alz.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.frontend.principal_id
}

resource "azurerm_container_app" "frontend" {
  name                         = "ca-uaip-frontend"
  container_app_environment_id = data.azurerm_container_app_environment.alz.id
  resource_group_name          = data.azurerm_resource_group.alz.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.frontend.id]
  }

  registry {
    server   = data.azurerm_container_registry.alz.login_server
    identity = azurerm_user_assigned_identity.frontend.id
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "frontend"
      image  = "${data.azurerm_container_registry.alz.login_server}/uaip-frontend:${var.frontend_image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  depends_on = [
    azurerm_role_assignment.frontend_acr_pull
  ]
}
