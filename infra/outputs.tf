output "frontend_fqdn" {
  description = "FQDN of the frontend Container App."
  value       = azurerm_container_app.frontend.ingress[0].fqdn
}

output "frontend_url" {
  description = "Full URL of the frontend."
  value       = "https://${azurerm_container_app.frontend.ingress[0].fqdn}"
}
