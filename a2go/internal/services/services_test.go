package services

import "testing"

func TestGatewayFor_OpenClaw(t *testing.T) {
	svc := GatewayFor("openclaw")
	if svc.Name != Gateway.Name {
		t.Errorf("GatewayFor(openclaw) = %q, want %q", svc.Name, Gateway.Name)
	}
	if svc.Port != Gateway.Port {
		t.Errorf("GatewayFor(openclaw) port = %d, want %d", svc.Port, Gateway.Port)
	}
}

func TestGatewayFor_Hermes(t *testing.T) {
	svc := GatewayFor("hermes")
	if svc.Name != HermesGateway.Name {
		t.Errorf("GatewayFor(hermes) = %q, want %q", svc.Name, HermesGateway.Name)
	}
	if svc.Port != HermesGateway.Port {
		t.Errorf("GatewayFor(hermes) port = %d, want %d", svc.Port, HermesGateway.Port)
	}
}

func TestGatewayFor_Empty(t *testing.T) {
	svc := GatewayFor("")
	if svc.Name != Gateway.Name {
		t.Errorf("GatewayFor('') = %q, want %q (default to openclaw)", svc.Name, Gateway.Name)
	}
}

func TestGatewayFor_Unknown(t *testing.T) {
	svc := GatewayFor("unknown")
	if svc.Name != Gateway.Name {
		t.Errorf("GatewayFor(unknown) = %q, want %q (default to openclaw)", svc.Name, Gateway.Name)
	}
}
