-- room_service dispatch requires a customer whose type allows it. This is
-- enforced here, at the DB level, so a client bypassing the API can't
-- create an invalid room_service order either -- the same "structurally
-- impossible" property B1-8's plan entry asks for, matching how B3's NCF
-- state machine will later be enforced by constraint, not just app code.
CREATE OR REPLACE FUNCTION bistro.enforce_room_service_requires_guest()
RETURNS trigger AS $$
DECLARE
  customer_allows boolean;
BEGIN
  IF NEW.dispatch_mode = 'room_service' THEN
    IF NEW.customer_id IS NULL THEN
      RAISE EXCEPTION 'room_service dispatch requires a customer'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT ct.allows_room_service INTO customer_allows
    FROM bistro.customers c
    JOIN bistro.customer_types ct ON ct.id = c.customer_type_id
    WHERE c.id = NEW.customer_id;

    IF customer_allows IS NOT TRUE THEN
      RAISE EXCEPTION 'customer type does not allow room_service dispatch'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_enforce_room_service ON bistro.orders;
CREATE TRIGGER orders_enforce_room_service
  BEFORE INSERT OR UPDATE ON bistro.orders
  FOR EACH ROW
  EXECUTE FUNCTION bistro.enforce_room_service_requires_guest();
