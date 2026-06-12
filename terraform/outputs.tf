output "quiz_url" {
  description = "Hit this from a Warp-connected device"
  value       = "https://${local.hostname}/"
}

output "quiz_eip" {
  description = "Elastic IP backing the DNS record"
  value       = aws_eip.quiz.public_ip
}

output "instance_id" {
  description = "Use with: aws ssm start-session --target <id>"
  value       = aws_instance.quiz.id
}

output "ssm_session_command" {
  description = "Copy/paste to debug if Caddy doesn't come up"
  value       = "aws ssm start-session --target ${aws_instance.quiz.id} --region ${var.aws_region}"
}
