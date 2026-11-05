# -----------------------------------------------------------------------------
# Platform / ALZ references
# -----------------------------------------------------------------------------

variable "subscription_id" {
  description = "Azure subscription ID."
  type        = string
}

variable "resource_group_name" {
  description = "Name of the ALZ resource group."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "australiaeast"
}

variable "container_app_environment_name" {
  description = "Name of the Container App Environment."
  type        = string
}

variable "container_registry_name" {
  description = "Name of the Azure Container Registry."
  type        = string
}

# -----------------------------------------------------------------------------
# Frontend workload configuration
# -----------------------------------------------------------------------------

variable "frontend_image_tag" {
  description = "Container image tag for the frontend."
  type        = string
  default     = "latest"
}

variable "apim_subscription_key" {
  description = "Rotated APIM subscription key, injected into nginx at runtime. Never pass it as a build argument."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+$", var.apim_subscription_key))
    error_message = "The APIM key must contain only letters, digits, underscores and hyphens."
  }
}

variable "frontend_htpasswd" {
  description = "Non-empty htpasswd file content for frontend HTTP Basic authentication. Use unique strong credentials and HTTPS ingress."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.frontend_htpasswd)) > 0
    error_message = "A non-empty htpasswd file is required."
  }
}

variable "tags" {
  description = "Tags to apply to all resources."
  type        = map(string)
  default = {
    workload = "uaip-frontend"
    program  = "uaip"
  }
}
