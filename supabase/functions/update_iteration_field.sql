
-- Create a function to update a specific field within an iteration
CREATE OR REPLACE FUNCTION update_iteration_field(job_id uuid, iteration_num integer, field_key text, field_value text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    iteration_index int;
    current_iterations jsonb;
BEGIN
    -- Get the current iterations array
    SELECT iterations INTO current_iterations FROM research_jobs WHERE id = job_id;

    -- Find the index of the target iteration (0-based)
    -- Note: jsonb_array_elements index is 0-based, WITH ORDINALITY index (idx) is 1-based
    SELECT idx - 1 INTO iteration_index
    FROM jsonb_array_elements(current_iterations) WITH ORDINALITY arr(elem, idx)
    WHERE (elem->>'iteration')::int = iteration_num;

    -- Check if the iteration was found
    IF iteration_index IS NOT NULL THEN
        -- Update the specific field within the specific iteration object
        UPDATE research_jobs
        SET iterations = jsonb_set(
                current_iterations,
                ARRAY[iteration_index::text, field_key], -- Path: {index, field_key}
                to_jsonb(field_value), -- New value (cast text to jsonb)
                true -- Create the key if it doesn't exist
            ),
            updated_at = NOW() -- Also update the timestamp
        WHERE id = job_id;
    ELSE
        -- Optional: Log or raise a notice if iteration not found
        RAISE NOTICE 'Iteration % not found for job %', iteration_num, job_id;
    END IF;
END;
$function$;
